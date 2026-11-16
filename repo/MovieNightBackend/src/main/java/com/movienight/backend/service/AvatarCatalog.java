package com.movienight.backend.service;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;

/**
 * The avatar manifest (#32). Image files live in the frontend's {@code public/avatars/};
 * this manifest is the single source of which avatars exist and the level that unlocks each.
 */
@Component
public class AvatarCatalog {

    public record Avatar(String id, String file, int unlockLevel) {}

    private final List<Avatar> avatars;

    public AvatarCatalog() {
        try (InputStream in = new ClassPathResource("avatars.json").getInputStream()) {
            avatars = List.copyOf(new ObjectMapper().readValue(in, new TypeReference<List<Avatar>>() {}));
        } catch (IOException e) {
            throw new IllegalStateException("Avatar manifest avatars.json is missing or invalid", e);
        }
    }

    public List<Avatar> all() {
        return avatars;
    }

    public Optional<Avatar> find(String id) {
        return avatars.stream().filter(a -> a.id().equals(id)).findFirst();
    }

    /** The avatar a user at this level shows: their choice while unlocked, else the default (null). */
    public Avatar effective(String chosenId, int level) {
        if (chosenId == null) return null;
        return find(chosenId).filter(a -> a.unlockLevel() <= level).orElse(null);
    }
}
