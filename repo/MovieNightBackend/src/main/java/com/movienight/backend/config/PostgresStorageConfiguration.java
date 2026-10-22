package com.movienight.backend.config;

import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.boot.jpa.autoconfigure.EntityManagerFactoryDependsOnPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.*;

/** Versioned PostgreSQL initialization; Hibernate and HTTP startup wait for migration. */
@Configuration
@Profile("postgres")
public class PostgresStorageConfiguration {
    @Bean
    static BeanFactoryPostProcessor validatePostgresSettings(Environment env) {
        return factory -> {
            for (String key : new String[]{"MN_DB_URL", "MN_DB_USER", "MN_DB_PASSWORD",
                    "MN_MIGRATION_USER", "MN_MIGRATION_PASSWORD", "MN_JWT_SECRET",
                    "MN_TMDB_KEY", "MN_OMDB_KEY"}) {
                if (env.getProperty(key, "").isBlank()) {
                    throw new IllegalStateException("Required PostgreSQL setting: " + key);
                }
            }
            // Disallow credentials/options in JDBC URLs, including values logged by drivers.
            if (!env.getRequiredProperty("MN_DB_URL").matches(
                    "jdbc:postgresql://[a-zA-Z0-9.\\-:\\[\\]]+/[a-zA-Z0-9_]+(\\?sslmode=(disable|require|verify-ca|verify-full))?")) {
                throw new IllegalStateException("MN_DB_URL must name an explicit PostgreSQL database; only sslmode is allowed as a URL option");
            }
            if (env.getRequiredProperty("MN_DB_USER").equals(env.getRequiredProperty("MN_MIGRATION_USER"))) {
                throw new IllegalStateException("PostgreSQL runtime and migration roles must differ");
            }
            for (String key : new String[]{"MN_DB_USER", "MN_MIGRATION_USER"}) {
                if (!env.getRequiredProperty(key).matches("[a-z_][a-z0-9_]{0,62}")) {
                    throw new IllegalStateException(key + " must be a lowercase PostgreSQL role name");
                }
            }
            if (env.getRequiredProperty("MN_JWT_SECRET").getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 32) {
                throw new IllegalStateException("MN_JWT_SECRET must contain at least 32 UTF-8 bytes");
            }
            if (!"validate".equals(env.getProperty("spring.jpa.hibernate.ddl-auto"))) {
                throw new IllegalStateException("PostgreSQL requires Hibernate schema validation");
            }
            for (var setting : java.util.Map.of(
                    "spring.datasource.url", "MN_DB_URL", "spring.datasource.username", "MN_DB_USER",
                    "spring.datasource.password", "MN_DB_PASSWORD", "app.jwt.secret", "MN_JWT_SECRET",
                    "app.tmdb.api-key", "MN_TMDB_KEY", "app.omdb.api-key", "MN_OMDB_KEY").entrySet()) {
                if (!env.getRequiredProperty(setting.getValue()).equals(env.getProperty(setting.getKey()))) {
                    throw new IllegalStateException("Conflicting PostgreSQL configuration: " + setting.getKey());
                }
            }
        };
    }

    @Bean
    Flyway postgresMigrations(Environment env) {
        try {
            Flyway flyway = Flyway.configure()
                    .dataSource(env.getRequiredProperty("MN_DB_URL"),
                            env.getRequiredProperty("MN_MIGRATION_USER"), env.getRequiredProperty("MN_MIGRATION_PASSWORD"))
                    .schemas("movienight").defaultSchema("movienight").createSchemas(false)
                    .placeholders(java.util.Map.of("runtimeRole", env.getRequiredProperty("MN_DB_USER")))
                    .locations(env.getProperty("app.migrations.locations", "classpath:db/postgres"))
                    .target(env.getProperty("app.migrations.target", "latest"))
                    .cleanDisabled(true).baselineOnMigrate(false).outOfOrder(false)
                    .validateMigrationNaming(true).validateOnMigrate(true).load();
            flyway.migrate();
            return flyway;
        } catch (Exception failure) {
            // Driver/migration exception messages can include connection details or row values.
            throw new IllegalStateException("PostgreSQL migration/validation failed; check target, credentials, schema and migration history using the maintenance guide");
        }
    }

    @Bean
    Object postgresRuntimePermissions(DataSource dataSource, Flyway postgresMigrations) {
        try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
            if (!"PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())) {
                throw new IllegalStateException();
            }
            try (var result = statement.executeQuery("""
                    SELECT has_schema_privilege(current_user, 'movienight', 'CREATE')
                        OR has_schema_privilege(current_user, 'public', 'CREATE')
                        OR has_database_privilege(current_user, current_database(), 'CREATE')
                        OR has_database_privilege(current_user, current_database(), 'TEMP')
                        OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user
                            AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
                        OR EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='movienight'
                            AND pg_has_role(current_user, tableowner, 'MEMBER'))
                        OR has_table_privilege(current_user, 'movienight.flyway_schema_history', 'INSERT,UPDATE,DELETE')
                    """)) {
                result.next();
                if (result.getBoolean(1)) throw new IllegalStateException();
            }
            verifyRelationshipConstraints(connection);
            if (!"1".equals(postgresMigrations.info().current().getVersion().getVersion())) {
                try (var result = statement.executeQuery("""
                        SELECT pg_get_constraintdef(oid) FROM pg_constraint
                        WHERE conrelid='movienight.user_movie_entries'::regclass
                          AND conname='valid_personal_rating' AND contype='c' AND convalidated
                        """)) {
                    String expected = "CHECK (((personal_rating IS NULL) OR (((personal_rating >= (0)::double precision) AND (personal_rating <= (10)::double precision)) AND ((personal_rating * (2)::double precision) = trunc((personal_rating * (2)::double precision))))))";
                    if (!result.next() || !expected.equals(result.getString(1))) {
                        throw new IllegalStateException();
                    }
                }
            }
            return new Object();
        } catch (Exception failure) {
            throw new IllegalStateException("PostgreSQL runtime permissions or relationship constraints invalid; check the maintenance guide");
        }
    }

    // Hibernate validates columns, but does not validate unique indexes or foreign keys.
    private static void verifyRelationshipConstraints(Connection connection) throws SQLException {
        var uniqueKeys = Map.of(
                "users", List.of(List.of("email"), List.of("username")),
                "movies", List.of(List.of("resource_type", "tmdb_id")),
                "user_movie_entries", List.of(List.of("user_id", "movie_id")),
                "custom_list_entries", List.of(List.of("custom_list_id", "movie_id")),
                "friendships", List.of(List.of("user_id", "friend_id")),
                "movie_similarity", List.of(List.of("tmdb_id", "neighbor_tmdb_id")),
                "personalized_recommendations", List.of(List.of("user_id", "resource_type", "tmdb_id")));
        for (var table : uniqueKeys.entrySet()) {
            Map<String, SortedMap<Short, String>> indexes = new HashMap<>();
            try (var rows = connection.getMetaData().getIndexInfo(null, "movienight", table.getKey(), true, false)) {
                while (rows.next()) {
                    String name = rows.getString("INDEX_NAME");
                    if (name != null && rows.getString("FILTER_CONDITION") == null) indexes.computeIfAbsent(name, key -> new TreeMap<>())
                            .put(rows.getShort("ORDINAL_POSITION"), rows.getString("COLUMN_NAME"));
                }
            }
            for (var columns : table.getValue()) {
                if (indexes.values().stream().noneMatch(index -> new ArrayList<>(index.values()).equals(columns))) {
                    throw new SQLException("Missing typed or relationship uniqueness");
                }
            }
        }
        var foreignKeys = Map.of(
                "user_movie_entries", Set.of("user_id:users:id", "movie_id:movies:id"),
                "custom_lists", Set.of("user_id:users:id"),
                "custom_list_entries", Set.of("custom_list_id:custom_lists:id", "movie_id:movies:id"),
                "friendships", Set.of("user_id:users:id", "friend_id:users:id"),
                "personalized_recommendations", Set.of("user_id:users:id"),
                "webhook_subscriptions", Set.of("user_id:users:id"),
                "webhook_delivery_logs", Set.of("subscription_id:webhook_subscriptions:id"));
        for (var table : foreignKeys.entrySet()) {
            Set<String> actual = new HashSet<>();
            try (var rows = connection.getMetaData().getImportedKeys(null, "movienight", table.getKey())) {
                while (rows.next()) {
                    if ("movienight".equals(rows.getString("PKTABLE_SCHEM"))) actual.add(
                            rows.getString("FKCOLUMN_NAME") + ":" + rows.getString("PKTABLE_NAME") + ":" + rows.getString("PKCOLUMN_NAME"));
                }
            }
            if (!actual.containsAll(table.getValue())) throw new SQLException("Missing relationship foreign key");
        }
    }

    @Bean
    static EntityManagerFactoryDependsOnPostProcessor postgresBeforeHibernate() {
        return new EntityManagerFactoryDependsOnPostProcessor("postgresRuntimePermissions");
    }
}
