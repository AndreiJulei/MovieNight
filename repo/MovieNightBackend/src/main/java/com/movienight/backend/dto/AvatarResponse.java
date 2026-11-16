package com.movienight.backend.dto;

import com.movienight.backend.service.AvatarCatalog;

/** An avatar as the API shows it: its id, the image file under /avatars/, and its unlock level (#32). */
public record AvatarResponse(String id, String file, int unlockLevel) {
    /** Null stays null: no chosen (or no longer unlocked) avatar shows the default initial. */
    public static AvatarResponse of(AvatarCatalog.Avatar avatar) {
        return avatar == null ? null : new AvatarResponse(avatar.id(), avatar.file(), avatar.unlockLevel());
    }
}
