# MovieNight

MovieNight organizes a person's viewing history and plans, and helps them
discover titles through their own interests and accepted friends.

## Language

**Title**:
A movie or TV series that a user can discover or organize. Anime TV series are
TV titles also included in the anime discovery category.
_Avoid_: Entry when referring to the title itself.

**Catalog**:
The shared collection of title information, independent of any user's viewing
status or personal opinion.
_Avoid_: Library when referring to shared title information.

**Library**:
A user's titles in their watchlist or watched history.
_Avoid_: Catalog, custom list.

**Library entry**:
One user's relationship to one title, including its viewing status and optional
personal rating and private notes.
_Avoid_: Movie when referring to the user's relationship rather than the title.

**Watchlist**:
The titles a user intends to watch and has deliberately added to their library.
_Avoid_: Watched list.

**Watched history**:
The titles a user has marked as watched, whether or not they have rated them.
_Avoid_: Watchlist.

**Personal rating**:
An optional opinion on a watched title, from 0 to 10 in 0.1 increments.
Zero is a rating; no rating means the user has not supplied one.
_Avoid_: Provider rating when referring to the user's own opinion.

**Audience rating**:
An aggregate of viewers' opinions reported by a named external provider on its
stated scale, distinct from a person's MovieNight personal rating.
_Avoid_: IMDb rating for another provider's score; critic approval.

**Critic approval**:
The percentage of critic reviews a named provider classifies as positive for a
title, distinct from an average review score or audience rating.
_Avoid_: Rating out of ten; audience rating.

**Discovery ranking score**:
A comparative value used to order titles within an Explore category, distinct
from an audience rating and from a prediction of personal enjoyment.
_Avoid_: Personal rating; guaranteed quality.

**Private note**:
An owner's personal text about a library entry, visible only to that owner.
_Avoid_: Public review, friend review.

**Custom list**:
A named collection of titles owned by one user, independent of viewing status.
It is private unless the owner shares it with accepted friends. A title may
belong to several custom lists without belonging to the owner's library.
_Avoid_: Watchlist when referring to an arbitrary collection.

**Offline snapshot**:
A read-only copy of one signed-in user's library and custom lists, saved on their
device after each successful online load and shown with its time when there is no
connection. Sign-out deletes it; changes are never made or queued from it.
_Avoid_: Offline mode when referring to the saved data; cache.

**Level**:
A user's progression step: each rank milestone in their watched history is one
level (level 1 at 0 watched, up to level 7 at 500). Levels unlock avatars.
_Avoid_: XP when referring to the level itself.

**Rank**:
The named stage of a user's watched-history count (e.g. The Chosen One at 100), shown
on the profile as a badge to the user and their friends.
_Avoid_: Title (a title is a movie or TV series); achievement.

**XP**:
Progress toward the next level: the watched titles counted since the current
milestone, out of the titles between it and the next one. Only the owner sees it,
as the XP bar on their profile.
_Avoid_: Level; points earned by anything other than watched history.

**Avatar**:
The picture that represents a user on their profile and in navigation. It is
the initial of their display name until they choose an image unlocked at their
level; an image that is no longer unlocked shows the initial again.
_Avoid_: Profile photo (users do not upload images).

**Shared list**:
A watchlist, watched history or custom list that its owner makes visible to
accepted friends. Watchlist and watched history are shared by default.
_Avoid_: Public list; nothing is visible to non-friends.

**Friend**:
A user with whom a friendship has been accepted by both parties.
_Avoid_: Friend when referring to a pending invitation.

**Friend suggestion**:
A candidate title selected using accepted friends' watched titles and personal
ratings. Titles friends plan to watch are a separately labelled source.
_Avoid_: Personalized recommendation when referring to friend-derived results.

**Personalized recommendation**:
A candidate selected using the user's own watched history and available
recommendation data.
_Avoid_: Personalized when referring to general discovery results.

**Movie similarity**:
A relationship between two movies derived from patterns in community ratings,
used as evidence for personalized recommendations.
_Avoid_: Personal rating, predicted enjoyment, guaranteed relevance.

**Similarity coverage**:
The movies for which the selected community-rating data provides eligible
movie similarities. Coverage alone does not establish recommendation quality
or guarantee displayable recommendations for a person.
_Avoid_: Full catalog coverage, recommendation accuracy.

**Explore**:
Discovery by movie, TV, or anime TV category, independent of personal viewing
history.
_Avoid_: Library when referring to browse results.

**Hero banner**:
A rotating presentation of prominent titles with high-resolution artwork and
direct title access. On the main page it is curated across catalog categories
and personal recommendations; an Explore page shows its category's variant, the
spotlight hero.
_Avoid_: Jumbotron, header carousel, promo slider.

**Spotlight hero**:
The shorter hero banner at the top of an Explore page, rotating five of that
category's titles trending on TMDB this week, labelled with the category name.
It keeps library titles because it follows a chart.
_Avoid_: Explore hero, category carousel.

**Top 10 today**:
The ranked row under an Explore page's spotlight hero: that category's first ten
titles trending on TMDB today, each beside its rank numeral. Library titles stay
in the chart and carry an "In library" tag.
_Avoid_: Trending row, leaderboard.

**Highlight chart**:
A provider chart behind an Explore page's header (the spotlight hero or Top 10
today), cached and refreshed separately from the discovery shelves.
_Avoid_: Explore shelf, discovery category.
