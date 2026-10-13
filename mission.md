# MovieNight mission

MovieNight helps a person decide what to watch, remember what they have watched,
and organize titles using their own ratings and collections. It combines a
personal media library with discovery informed by accepted friends and the
person's viewing history.

The audience is people who want to organize their viewing and discover titles,
including users beyond the owner and their friends. MovieNight is intended to
be a publicly deployed application. Local development and testing support that
goal; deployment is part of delivering the product.

Developing MovieNight is also a learning project: changes should demonstrate a
repeatable, understandable specification, implementation, and validation process.

## Scope

The product covers movie discovery and tracking, private custom lists, accepted
friendships, friend suggestions, and personalized recommendations. TV and anime
TV discovery follow the verified movie workflow. Anime films are deferred.

See [spec.md](spec.md) for behavior and boundaries. See [roadmap.md](roadmap.md)
for the order of delivery and [tech-stack.md](tech-stack.md) for engineering facts.
The project constitution is `mission.md`, `tech-stack.md`, and `roadmap.md`.

## Success

- A user can discover a title, deliberately save it, mark it watched, and recover
  the same state and rating after reloading.
- Browsing does not accidentally add titles to the personal library.
- Friends see only the information the product deliberately shares.
- Recommendations communicate their source and handle missing history honestly.
- Each completed roadmap slice has acceptance criteria and recorded validation.
- Users can access the deployed application and retain their library data across
  application restarts and releases.

This is a target, not a claim that the existing working tree meets it.
