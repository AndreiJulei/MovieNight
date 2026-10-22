package com.movienight.backend.config;

import com.movienight.backend.model.ResourceType;
import javax.sql.DataSource;
import java.nio.file.*;
import java.security.MessageDigest;
import java.sql.*;
import java.util.*;

/** Explicit V1 local migration. H2 DDL commits; every DDL step is resumable. */
public class LocalH2IdentityMigration {
    private final DataSource dataSource;
    private final String mappingFile;
    private static final String HISTORY = "TITLE_IDENTITY_MIGRATIONS";

    public LocalH2IdentityMigration(DataSource dataSource, String mappingFile) {
        this.dataSource = dataSource;
        this.mappingFile = mappingFile;
    }

    public void migrate() throws Exception {
        try (var c = dataSource.getConnection()) {
            if (!"H2".equals(c.getMetaData().getDatabaseProductName())) {
                throw new IllegalStateException("The local title migration supports H2 only; select a production migration separately");
            }
            if (!table(c, "MOVIES")) return; // Fresh database: Hibernate creates the typed schema.
            if (table(c, HISTORY)) {
                try (var s = c.createStatement(); var rs = s.executeQuery("select complete from title_identity_migrations where version=1")) {
                    if (rs.next() && rs.getBoolean(1)) { verify(c); return; }
                }
            } else if (column(c, "MOVIES", "RESOURCE_TYPE") && unique(c, "MOVIES", List.of("RESOURCE_TYPE", "TMDB_ID"))) {
                verify(c); history(c, "fresh-typed-schema"); complete(c); return;
            }

            // No schema or data writes until every legacy row has reviewed provenance.
            Properties properties = new Properties();
            if (mappingFile != null && !mappingFile.isBlank()) {
                try (var reader = Files.newBufferedReader(Path.of(mappingFile))) { properties.load(reader); }
            }
            var mappings = new TreeMap<Long, String>();
            var problems = new ArrayList<Long>();
            var identities = new HashSet<String>();
            try (var s = c.createStatement(); var rs = s.executeQuery("select id,tmdb_id from movies order by id")) {
                while (rs.next()) {
                    long id = rs.getLong(1);
                    String category = properties.getProperty(Long.toString(id));
                    if (category == null || !Set.of("MOVIE", "TV", "ANIME").contains(category)) { problems.add(id); continue; }
                    mappings.put(id, category);
                    Long providerId = rs.getObject(2, Long.class);
                    if (providerId != null && !identities.add(ResourceType.fromCategory(category) + ":" + providerId)) {
                        throw new IllegalStateException("Reviewed mappings collide at catalog row " + id);
                    }
                }
            }
            if (!problems.isEmpty()) throw new IllegalStateException("Reviewed catalog type mappings required for rows " + problems);
            if (properties.size() != mappings.size()) throw new IllegalStateException("Mapping file has unknown or invalid catalog row IDs");
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mappings.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            history(c, hash); // The fingerprint also guards interrupted/resumed migrations.

            execute(c, "alter table movies add column if not exists resource_type varchar(10)");
            c.setAutoCommit(false);
            try (var update = c.prepareStatement("update movies set resource_type=?,media_type=? where id=?")) {
                for (var entry : mappings.entrySet()) {
                    update.setString(1, ResourceType.fromCategory(entry.getValue()).name());
                    update.setString(2, entry.getValue()); update.setLong(3, entry.getKey()); update.addBatch();
                }
                update.executeBatch(); c.commit();
            } catch (Exception e) { c.rollback(); throw e; }
            finally { c.setAutoCommit(true); }
            execute(c, "alter table movies alter column resource_type set not null");
            removeUnique(c, "MOVIES", List.of("TMDB_ID"));
            execute(c, "create unique index if not exists idx_movie_tmdb_id on movies(resource_type,tmdb_id)");
            for (String cache : List.of("CACHED_MOVIE_LIST", "PERSONALIZED_RECOMMENDATIONS")) {
                if (!table(c, cache)) continue;
                execute(c, "delete from " + cache);
                execute(c, "alter table " + cache + " add column if not exists resource_type varchar(10)");
                execute(c, "alter table " + cache + " alter column resource_type set not null");
            }
            if (table(c, "PERSONALIZED_RECOMMENDATIONS")) {
                removeUnique(c, "PERSONALIZED_RECOMMENDATIONS", List.of("USER_ID", "TMDB_ID"));
                execute(c, "create unique index if not exists idx_rec_user_tmdb on personalized_recommendations(user_id,resource_type,tmdb_id)");
            }
            if (table(c, "USERS") && column(c, "USERS", "NEEDS_RECOMMENDATION_REFRESH")) {
                execute(c, "update users set needs_recommendation_refresh=true");
            }
            verify(c); complete(c);
        }
    }

    private void history(Connection c, String fingerprint) throws SQLException {
        execute(c, "create table if not exists title_identity_migrations(version integer primary key, mapping_hash varchar(100) not null, complete boolean not null)");
        try (var s = c.createStatement(); var rs = s.executeQuery("select mapping_hash from title_identity_migrations where version=1")) {
            if (rs.next()) {
                if (!fingerprint.equals(rs.getString(1))) throw new IllegalStateException("Interrupted V1 migration requires the same reviewed mapping file");
                return;
            }
        }
        try (var s = c.prepareStatement("insert into title_identity_migrations values(1,?,false)")) { s.setString(1, fingerprint); s.executeUpdate(); }
    }

    private void complete(Connection c) throws SQLException { execute(c, "update title_identity_migrations set complete=true where version=1"); }

    private void verify(Connection c) throws SQLException {
        if (!column(c, "MOVIES", "RESOURCE_TYPE") || !unique(c, "MOVIES", List.of("RESOURCE_TYPE", "TMDB_ID"))
                || unique(c, "MOVIES", List.of("TMDB_ID"))) {
            throw new IllegalStateException("V1 typed catalog schema is incomplete");
        }
        try (var s = c.createStatement(); var rs = s.executeQuery("select count(*) from movies where media_type is null or media_type not in ('MOVIE','TV','ANIME') or resource_type is null or resource_type not in ('MOVIE','TV') or resource_type <> case when media_type='MOVIE' then 'MOVIE' else 'TV' end")) {
            rs.next(); if (rs.getLong(1) != 0) throw new IllegalStateException("V1 catalog contains unverified resource types");
        }
    }

    private boolean table(Connection c, String table) throws SQLException {
        try (var rs = c.getMetaData().getTables(null, "PUBLIC", table, new String[]{"TABLE"})) { return rs.next(); }
    }
    private boolean column(Connection c, String table, String name) throws SQLException {
        try (var rs = c.getMetaData().getColumns(null, "PUBLIC", table, name)) { return rs.next(); }
    }
    private Map<String, List<String>> indexes(Connection c, String table) throws SQLException {
        Map<String, SortedMap<Integer, String>> grouped = new LinkedHashMap<>();
        try (var rs = c.getMetaData().getIndexInfo(null, "PUBLIC", table, true, false)) {
            while (rs.next()) if (rs.getString("COLUMN_NAME") != null) grouped.computeIfAbsent(rs.getString("INDEX_NAME"), k -> new TreeMap<>())
                    .put(rs.getInt("ORDINAL_POSITION"), rs.getString("COLUMN_NAME"));
        }
        Map<String, List<String>> result = new LinkedHashMap<>();
        grouped.forEach((name, cols) -> result.put(name, new ArrayList<>(cols.values()))); return result;
    }
    private boolean unique(Connection c, String table, List<String> columns) throws SQLException { return indexes(c, table).containsValue(columns); }

    private void removeUnique(Connection c, String table, List<String> columns) throws SQLException {
        var constraints = new LinkedHashMap<String, List<String>>();
        try (var s = c.prepareStatement("select k.constraint_name,k.column_name from information_schema.key_column_usage k join information_schema.table_constraints t on k.constraint_schema=t.constraint_schema and k.constraint_name=t.constraint_name where t.table_name=? and t.constraint_type='UNIQUE' order by k.ordinal_position")) {
            s.setString(1, table);
            try (var rs = s.executeQuery()) { while (rs.next()) constraints.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getString(2)); }
        }
        for (var entry : constraints.entrySet()) if (entry.getValue().equals(columns)) execute(c, "alter table " + table + " drop constraint " + quoted(entry.getKey()));
        for (var entry : indexes(c, table).entrySet()) if (entry.getValue().equals(columns)) execute(c, "drop index " + quoted(entry.getKey()));
    }
    private String quoted(String identifier) { return "\"" + identifier.replace("\"", "\"\"") + "\""; }
    private void execute(Connection c, String sql) throws SQLException { try (var s = c.createStatement()) { s.execute(sql); } }
}
