package com.movienight.backend.config;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.jpa.autoconfigure.EntityManagerFactoryDependsOnPostProcessor;

@Configuration
public class IdentityMigrationConfiguration {
    @Bean(initMethod = "migrate")
    LocalH2IdentityMigration localH2IdentityMigration(DataSource dataSource,
            @Value("${app.catalog-migration.mapping-file:}") String mappingFile) {
        return new LocalH2IdentityMigration(dataSource, mappingFile);
    }

    @Bean
    static EntityManagerFactoryDependsOnPostProcessor identityMigrationBeforeHibernate() {
        return new EntityManagerFactoryDependsOnPostProcessor("localH2IdentityMigration");
    }
}
