import casino from "../imports/MV5BMDRlZWZjZjYtYzY2NS00ZWVjLTkwYzAtZTA2ZDAzMGRiYmYwXkEyXkFqcGc_._V1_QL75_UX290_.jpg";
import darkKnight from "../imports/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw__._V1_QL75_UX294_.jpg";
import thereWillBeBlood from "../imports/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_.jpg";
import goodfellas from "../imports/MV5BN2E5NzI2ZGMtY2VjNi00YTRjLWI1MDUtZGY5OWU1MWJjZjRjXkEyXkFqcGc_._V1_QL75_UX292_.jpg";
import spaceOdyssey from "../imports/MV5BNTFiZmM2ZTQtNDBiMS00MGY2LTlhN2QtZmM5NzgyYWMxODY4XkEyXkFqcGc_._V1_QL75_UX294_.jpg";
import americanPsycho from "../imports/MV5BNzBjM2I5ZjUtNmIzNy00OGNkLWIwZDMtOTAwYWUwMzA2YjdlXkEyXkFqcGc_._V1_QL75_UX294_.jpg";

// New user-provided iconic movie posters
import momPoster from "../imports/MoM.jpg";
import oldboyPoster from "../imports/oldboy.jpg";
import schindlersPoster from "../imports/SchildersList.jpg";
import apocalypsePoster from "../imports/apocalypseNow.jpg";
import donniePoster from "../imports/DonnieDarko.jpg";

export type CastMember = {
  name: string;
  role: string;
};

export type MockPoster = {
  id: string;
  title: string;
  year: number;
  posterUrl: string;
  imdb: number;
  rt: number | null;
  overview: string;
  genres?: string[];
  cast?: CastMember[];
  trailerKey?: string; // YouTube video ID
};

export const mockPosters: MockPoster[] = [
  {
    id: "p-casino",
    title: "Casino",
    year: 1995,
    posterUrl: casino,
    imdb: 8.2,
    rt: 80,
    genres: ["Crime", "Drama"],
    cast: [
      { name: "Robert De Niro", role: "Sam 'Ace' Rothstein" },
      { name: "Sharon Stone", role: "Ginger McKenna" },
      { name: "Joe Pesci", role: "Nicky Santoro" },
      { name: "James Woods", role: "Lester Diamond" },
    ],
    trailerKey: "EJXDMwGWhoA",
    overview:
      "A mob-backed casino boss runs the Vegas floor with ruthless precision, until greed, love, and a volatile enforcer bring the whole operation down.",
  },
  {
    id: "p-dark-knight",
    title: "The Dark Knight",
    year: 2008,
    posterUrl: darkKnight,
    imdb: 9.0,
    rt: 94,
    genres: ["Action", "Crime", "Drama"],
    cast: [
      { name: "Christian Bale", role: "Bruce Wayne / Batman" },
      { name: "Heath Ledger", role: "Joker" },
      { name: "Aaron Eckhart", role: "Harvey Dent" },
      { name: "Michael Caine", role: "Alfred" },
    ],
    trailerKey: "EXeTwQWrcwY",
    overview:
      "A masked vigilante, a crusading district attorney, and an anarchic clown push a city to the edge in a battle over its soul.",
  },
  {
    id: "p-there-will-be-blood",
    title: "There Will Be Blood",
    year: 2007,
    posterUrl: thereWillBeBlood,
    imdb: 8.2,
    rt: 91,
    genres: ["Drama"],
    cast: [
      { name: "Daniel Day-Lewis", role: "Daniel Plainview" },
      { name: "Paul Dano", role: "Paul Sunday / Eli Sunday" },
      { name: "Kevin J. O'Connor", role: "Henry" },
      { name: "Ciarán Hinds", role: "Fletcher" },
    ],
    trailerKey: "FeSLPELpMeM",
    overview:
      "A silver-tongued oil prospector claws his fortune out of the California earth, consumed by ambition and a hatred that leaves nothing standing.",
  },
  {
    id: "p-goodfellas",
    title: "Goodfellas",
    year: 1990,
    posterUrl: goodfellas,
    imdb: 8.7,
    rt: 95,
    genres: ["Biography", "Crime", "Drama"],
    cast: [
      { name: "Robert De Niro", role: "James Conway" },
      { name: "Ray Liotta", role: "Henry Hill" },
      { name: "Joe Pesci", role: "Tommy DeVito" },
      { name: "Lorraine Bracco", role: "Karen Hill" },
    ],
    trailerKey: "2ilzidi_J8Q",
    overview:
      "Decades inside the mob, told from the inside — the glamour, the paranoia, and the long slow unraveling of a made man's world.",
  },
  {
    id: "p-2001",
    title: "2001: A Space Odyssey",
    year: 1968,
    posterUrl: spaceOdyssey,
    imdb: 8.3,
    rt: 92,
    genres: ["Adventure", "Sci-Fi"],
    cast: [
      { name: "Keir Dullea", role: "Dr. Dave Bowman" },
      { name: "Gary Lockwood", role: "Dr. Frank Poole" },
      { name: "William Sylvester", role: "Dr. Heywood Floyd" },
      { name: "Douglas Rain", role: "HAL 9000 (voice)" },
    ],
    trailerKey: "oR_e9y-bka0",
    overview:
      "From the dawn of man to the edge of the infinite, a voyage past a watchful machine intelligence toward something beyond comprehension.",
  },
  {
    id: "p-american-psycho",
    title: "American Psycho",
    year: 2000,
    posterUrl: americanPsycho,
    imdb: 7.6,
    rt: 68,
    genres: ["Crime", "Drama", "Horror"],
    cast: [
      { name: "Christian Bale", role: "Patrick Bateman" },
      { name: "Justin Theroux", role: "Timothy Bryce" },
      { name: "Josh Lucas", role: "Craig McDermott" },
      { name: "Chloë Sevigny", role: "Jean" },
    ],
    trailerKey: "5YnGhW4UEhc",
    overview:
      "A Wall Street investment banker with impeccable taste and no interior life narrates his descent into violence — or the fantasy of it.",
  },
  {
    id: "p-mom",
    title: "Memories of Murder",
    year: 2003,
    posterUrl: momPoster,
    imdb: 8.1,
    rt: 95,
    genres: ["Crime", "Drama", "Mystery"],
    cast: [
      { name: "Song Kang-ho", role: "Park Doo-man" },
      { name: "Kim Sang-kyung", role: "Seo Tae-yoon" },
      { name: "Roe-ha Kim", role: "Cho Yong-koo" },
      { name: "Song Jae-ho", role: "Shin Dong-chul" },
    ],
    trailerKey: "dTnmdYrpy1A",
    overview:
      "In 1986 rural South Korea, two detectives with diametrically opposed methods struggle to solve the country's first recorded serial killings.",
  },
  {
    id: "p-oldboy",
    title: "Oldboy",
    year: 2003,
    posterUrl: oldboyPoster,
    imdb: 8.4,
    rt: 82,
    genres: ["Action", "Drama", "Mystery"],
    cast: [
      { name: "Choi Min-sik", role: "Oh Dae-su" },
      { name: "Yoo Ji-tae", role: "Lee Woo-jin" },
      { name: "Kang Hye-jung", role: "Mi-do" },
      { name: "Kim Byeong-ok", role: "Mr. Han" },
    ],
    trailerKey: "2HkjrJ6IK5E",
    overview:
      "After being kidnapped and imprisoned for fifteen years for reasons unknown, a desperate man is released and given five days to find his captor.",
  },
  {
    id: "p-schindlers-list",
    title: "Schindler's List",
    year: 1993,
    posterUrl: schindlersPoster,
    imdb: 9.0,
    rt: 98,
    genres: ["Biography", "Drama", "History"],
    cast: [
      { name: "Liam Neeson", role: "Oskar Schindler" },
      { name: "Ben Kingsley", role: "Itzhak Stern" },
      { name: "Ralph Fiennes", role: "Amon Göth" },
      { name: "Caroline Goodall", role: "Emilie Schindler" },
    ],
    trailerKey: "gG22XNhtnoY",
    overview:
      "In German-occupied Poland during World War II, industrialist Oskar Schindler gradually becomes concerned for his Jewish workforce after witnessing their persecution by the Nazis.",
  },
  {
    id: "p-apocalypse-now",
    title: "Apocalypse Now",
    year: 1979,
    posterUrl: apocalypsePoster,
    imdb: 8.4,
    rt: 98,
    genres: ["Drama", "Mystery", "War"],
    cast: [
      { name: "Martin Sheen", role: "Captain Benjamin L. Willard" },
      { name: "Marlon Brando", role: "Colonel Walter E. Kurtz" },
      { name: "Robert Duvall", role: "Lieutenant Colonel Bill Kilgore" },
      { name: "Frederic Forrest", role: "Jay 'Chef' Hicks" },
    ],
    trailerKey: "FTjG-Aux_yU",
    overview:
      "A U.S. Army officer serving in Vietnam is tasked with assassinating a renegade Special Forces Colonel who sees himself as a god.",
  },
  {
    id: "p-donnie-darko",
    title: "Donnie Darko",
    year: 2001,
    posterUrl: donniePoster,
    imdb: 8.0,
    rt: 87,
    genres: ["Drama", "Mystery", "Sci-Fi"],
    cast: [
      { name: "Jake Gyllenhaal", role: "Donnie Darko" },
      { name: "Jena Malone", role: "Gretchen Ross" },
      { name: "Mary McDonnell", role: "Rose Darko" },
      { name: "Maggie Gyllenhaal", role: "Elizabeth Darko" },
    ],
    trailerKey: "rPeGaXWly58",
    overview:
      "After narrowly escaping a bizarre accident, a troubled teenager is plagued by visions of a man in a large rabbit suit who manipulates him into committing a series of crimes.",
  },
];
