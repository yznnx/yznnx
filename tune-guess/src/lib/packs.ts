/** Ready-made song packs for Quick play (no account needed). Each pack is a list of artists to pull hits from. */
export interface Pack {
  id: string;
  emoji: string;
  name: string;
  artists: string[];
}

export const PACKS: Pack[] = [
  {
    id: 'pop',
    emoji: '🎤',
    name: 'Pop hits',
    artists: ['Taylor Swift', 'Dua Lipa', 'The Weeknd', 'Billie Eilish', 'Harry Styles', 'Olivia Rodrigo', 'Ed Sheeran', 'Ariana Grande', 'Sabrina Carpenter', 'Bruno Mars'],
  },
  {
    id: 'rock',
    emoji: '🎸',
    name: 'Rock classics',
    artists: ['Queen', 'AC/DC', 'The Beatles', 'Nirvana', "Guns N' Roses", 'The Rolling Stones', 'Led Zeppelin', 'Bon Jovi', 'Red Hot Chili Peppers', 'Foo Fighters'],
  },
  {
    id: 'hiphop',
    emoji: '🎧',
    name: 'Hip-hop',
    artists: ['Eminem', 'Drake', 'Kendrick Lamar', 'Travis Scott', '50 Cent', 'Snoop Dogg', 'Post Malone', 'Nicki Minaj', 'Doja Cat', 'OutKast'],
  },
  {
    id: '80s',
    emoji: '📼',
    name: '80s',
    artists: ['Michael Jackson', 'Madonna', 'a-ha', 'Whitney Houston', 'Cyndi Lauper', 'Duran Duran', 'Prince', 'Tears for Fears', 'Eurythmics', 'George Michael'],
  },
  {
    id: '90s',
    emoji: '💿',
    name: '90s',
    artists: ['Spice Girls', 'Backstreet Boys', 'Britney Spears', 'Oasis', 'TLC', 'Mariah Carey', 'Ace of Base', 'Alanis Morissette', 'No Doubt', 'Green Day'],
  },
  {
    id: '2000s',
    emoji: '📱',
    name: '2000s',
    artists: ['Beyoncé', 'Rihanna', 'Usher', 'Black Eyed Peas', 'Linkin Park', 'Amy Winehouse', 'Coldplay', 'Lady Gaga', 'Avril Lavigne', 'Kelly Clarkson'],
  },
  {
    id: 'dance',
    emoji: '🪩',
    name: 'Dance & EDM',
    artists: ['David Guetta', 'Calvin Harris', 'Avicii', 'Daft Punk', 'Martin Garrix', 'Swedish House Mafia', 'Tiësto', 'Robin Schulz', 'Kygo', 'Clean Bandit'],
  },
  {
    id: 'deutsch',
    emoji: '🇩🇪',
    name: 'Deutsch',
    artists: ['Peter Fox', 'Helene Fischer', 'Rammstein', 'Die Toten Hosen', 'Mark Forster', 'Herbert Grönemeyer', 'Nena', 'Cro', 'Apache 207', 'AnnenMayKantereit'],
  },
];
