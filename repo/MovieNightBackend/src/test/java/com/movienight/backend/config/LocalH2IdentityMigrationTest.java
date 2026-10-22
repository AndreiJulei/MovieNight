package com.movienight.backend.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.nio.file.*;
import java.sql.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class LocalH2IdentityMigrationTest {
    @TempDir Path directory;

    DriverManagerDataSource legacy() throws Exception {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:migration-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        try (var c = ds.getConnection(); var s = c.createStatement()) {
            s.execute("create table movies(id bigint primary key, tmdb_id bigint unique, media_type varchar(20), title varchar(300))");
            s.execute("create unique index idx_movie_tmdb_id on movies(tmdb_id)");
            s.execute("insert into movies values(1,123,'MOVIE','Movie'),(2,124,'ANIME','Anime film'),(3,125,'TV','Anime series')");
            s.execute("create table users(id bigint primary key)");
            s.execute("insert into users values(1),(2)");
            s.execute("create table user_movie_entries(id bigint primary key, user_id bigint references users(id), movie_id bigint references movies(id), personal_rating double, notes varchar, status varchar)");
            s.execute("insert into user_movie_entries values(1,1,1,0,'private','WATCHED'),(2,2,2,7.5,'other','WATCHED')");
            s.execute("create table custom_list_entries(id bigint primary key, movie_id bigint references movies(id))");
            s.execute("insert into custom_list_entries values(1,3)");
            s.execute("create table cached_movie_list(id bigint primary key)");
            s.execute("insert into cached_movie_list values(1)");
        }
        return ds;
    }

    @Test void verifiedMigrationPreservesRelationshipsAndSupportsEqualIdsAndSafeRerun() throws Exception {
        var ds = legacy();
        Path mappings = directory.resolve("reviewed.properties");
        Files.writeString(mappings, "1=MOVIE\n2=MOVIE\n3=ANIME\n");
        var migration = new LocalH2IdentityMigration(ds, mappings.toString());
        migration.migrate();
        try (var c = ds.getConnection(); var s = c.createStatement()) {
            var row = s.executeQuery("select resource_type,media_type from movies where id=2"); row.next();
            assertThat(row.getString(1)).isEqualTo("MOVIE"); assertThat(row.getString(2)).isEqualTo("MOVIE");
            row = s.executeQuery("select resource_type,media_type from movies where id=3"); row.next();
            assertThat(row.getString(1)).isEqualTo("TV"); assertThat(row.getString(2)).isEqualTo("ANIME");
            s.execute("insert into movies(id,tmdb_id,media_type,resource_type,title) values(4,123,'TV','TV','Distinct series')");
            row = s.executeQuery("select e.personal_rating,e.notes,m.title from user_movie_entries e join movies m on m.id=e.movie_id where e.id=1"); row.next();
            assertThat(row.getDouble(1)).isZero(); assertThat(row.getString(2)).isEqualTo("private"); assertThat(row.getString(3)).isEqualTo("Movie");
            row = s.executeQuery("select count(*) from custom_list_entries where movie_id=3"); row.next(); assertThat(row.getInt(1)).isEqualTo(1);
            row = s.executeQuery("select count(*) from cached_movie_list"); row.next(); assertThat(row.getInt(1)).isZero();
            s.execute("insert into cached_movie_list(id,resource_type) values(2,'TV')");
        }
        new LocalH2IdentityMigration(ds, "").migrate();
        try (var c = ds.getConnection(); var s = c.createStatement()) {
            var row = s.executeQuery("select count(*) from cached_movie_list"); row.next(); assertThat(row.getInt(1)).isEqualTo(1);
        }
    }

    @Test void ambiguityStopsBeforeAnySchemaOrDataChange() throws Exception {
        var ds = legacy();
        assertThatThrownBy(() -> new LocalH2IdentityMigration(ds, "").migrate())
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("1").hasMessageContaining("2");
        try (var c = ds.getConnection(); var s = c.createStatement()) {
            assertThat(c.getMetaData().getColumns(null, "PUBLIC", "MOVIES", "RESOURCE_TYPE").next()).isFalse();
            assertThat(c.getMetaData().getTables(null, "PUBLIC", "TITLE_IDENTITY_MIGRATIONS", null).next()).isFalse();
            var row = s.executeQuery("select count(*) from movies"); row.next(); assertThat(row.getInt(1)).isEqualTo(3);
            row = s.executeQuery("select count(*) from cached_movie_list"); row.next(); assertThat(row.getInt(1)).isEqualTo(1);
        }
    }

    @Test void interruptedDdlCanResumeOnlyWithTheSameReviewedMapping() throws Exception {
        var ds = legacy();
        Path mapping = directory.resolve("reviewed.properties");
        Files.writeString(mapping, "1=MOVIE\n2=MOVIE\n3=ANIME\n");
        try (var c = ds.getConnection(); var s = c.createStatement()) {
            s.execute("create table blocked_cache_clear(id bigint references cached_movie_list(id))");
            s.execute("insert into blocked_cache_clear values(1)");
        }
        assertThatThrownBy(() -> new LocalH2IdentityMigration(ds, mapping.toString()).migrate()).isInstanceOf(SQLException.class);
        Files.writeString(mapping, "1=MOVIE\n2=TV\n3=ANIME\n");
        assertThatThrownBy(() -> new LocalH2IdentityMigration(ds, mapping.toString()).migrate())
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("same reviewed mapping");
        Files.writeString(mapping, "1=MOVIE\n2=MOVIE\n3=ANIME\n");
        try (var c = ds.getConnection(); var s = c.createStatement()) { s.execute("drop table blocked_cache_clear"); }
        new LocalH2IdentityMigration(ds, mapping.toString()).migrate();
        try (var c = ds.getConnection(); var s = c.createStatement()) {
            var row = s.executeQuery("select personal_rating,notes from user_movie_entries where id=2"); row.next();
            assertThat(row.getDouble(1)).isEqualTo(7.5); assertThat(row.getString(2)).isEqualTo("other");
            row = s.executeQuery("select complete from title_identity_migrations where version=1"); row.next(); assertThat(row.getBoolean(1)).isTrue();
        }
    }
}
