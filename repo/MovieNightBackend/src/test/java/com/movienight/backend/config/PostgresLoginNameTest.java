package com.movienight.backend.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PostgresLoginNameTest {
    @Test void plainRoleAndPoolerTenantLoginAreAcceptedAndMapToTheSameRole() {
        assertTrue("mn_runtime".matches(PostgresStorageConfiguration.LOGIN_NAME));
        assertTrue("mn_runtime.jnoekprnepweopcfqiip".matches(PostgresStorageConfiguration.LOGIN_NAME));
        assertEquals("mn_runtime", PostgresStorageConfiguration.roleName("mn_runtime"));
        assertEquals("mn_runtime", PostgresStorageConfiguration.roleName("mn_runtime.jnoekprnepweopcfqiip"));
    }

    @Test void uppercaseQuotesSemicolonsAndExtraSuffixesAreRejected() {
        for (String bad : new String[]{"MN_Runtime", "mn runtime", "mn_runtime;drop", "mn\"x", "mn_runtime.a.b", "mn_runtime.", ".ref", "mn_runtime.REF"}) {
            assertFalse(bad.matches(PostgresStorageConfiguration.LOGIN_NAME), bad);
        }
    }
}
