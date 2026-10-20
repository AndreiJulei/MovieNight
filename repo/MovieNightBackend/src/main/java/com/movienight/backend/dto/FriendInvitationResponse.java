package com.movienight.backend.dto;

/** Pending invitations deliberately contain no library statistics. */
public record FriendInvitationResponse(Long senderId, String senderUsername, String senderDisplayName,
                                       Long recipientId, String recipientUsername, String recipientDisplayName) {}
