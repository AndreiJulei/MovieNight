package com.movienight.backend.security;

import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserLookup;
import com.movienight.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String identifier) throws UsernameNotFoundException {
        String clean = identifier != null ? identifier.trim().toLowerCase() : "";

        User user = userRepository.findByEmailIgnoreCase(clean)
                .or(() -> userRepository.findByUsernameIgnoreCase(clean))
                .or(() -> userRepository.findByUsername(clean))
                .orElseThrow(() -> new UsernameNotFoundException("User not found with identifier: " + clean));

        return toDetails(user);
    }

    /**
     * Load the account a token names. The token's user ID must match, so a token issued before a
     * username change can never authenticate as a different account that later claims that name.
     */
    @Transactional(readOnly = true)
    public UserDetails loadByTokenSubject(String username, Long userId) {
        User user = UserLookup.byUsername(userRepository, username)
                .orElseThrow(() -> new UsernameNotFoundException("Token subject no longer exists"));
        if (userId != null && !userId.equals(user.getId())) {
            throw new UsernameNotFoundException("Token subject belongs to another account");
        }
        return toDetails(user);
    }

    private UserDetails toDetails(User user) {
        return new org.springframework.security.core.userdetails.User(
                user.getUsername(),
                user.getPassword(),
                Collections.singletonList(new SimpleGrantedAuthority(user.getRole()))
        );
    }
}
