export interface HomeContent {
  tagline: string
  subtitle: string
  location: string
  communityTitle: string
  communityImage: string
  communityTags: string[]
  communityLink: string
  offersTitle: string
  offersImage: string
  offersText: string
  ctaButtons: {
    primary: { text: string; href: string }
    secondary: { text: string; href: string }
    tertiary: { text: string; href: string }
  }
  eventsTitle: string
  eventsSubtitle: string
  peopleTitle: string
  peopleSubtitle: string
  galleryTitle: string
  gallerySubtitle: string
  footerText: string
  footerContact: string
}

export const defaultContent: HomeContent = {
  tagline: 'An incubator & community space for doers of good and masters of craft.',
  subtitle: '1680 Mission Street, San Francisco',
  location: 'https://maps.google.com/?q=Mox+1680+Mission+St+San+Francisco',
  communityTitle: 'We bring together:',
  communityImage: '/images/014.jpg',
  communityTags: [
    'AI alignment researchers',
    'Startup founders',
    'Defensive accelerationists',
    'Filmmakers',
    'Writers',
    'High impact nonprofits',
    'Artisans',
    'Figgie players',
    'Policy advocates',
    'Community builders',
    'Members of technical and untechnical staff',
  ],
  communityLink: 'See people at Mox ↓',
  offersTitle: 'What Mox Offers',
  offersImage: '/images/005.jpg',
  offersText:
    'Mox offers all the infrastructure you need for deep work, a rich community atmosphere, and events that you\'ll find meaningful.',
  ctaButtons: {
    primary: { text: 'Apply for membership', href: '/membership' },
    secondary: { text: 'Inquire about offices', href: 'mailto:robin@moxsf.com' },
    tertiary: { text: 'Buy a day pass', href: '/day-pass' },
  },
  eventsTitle: 'Events',
  eventsSubtitle: "What's happening at Mox",
  peopleTitle: 'Humans of Mox',
  peopleSubtitle: 'The community that makes Mox special',
  galleryTitle: 'The Space',
  gallerySubtitle: 'A glimpse into our home',
  footerText: 'A project of Manifund',
  footerContact: 'robin@moxsf.com',
}

export const punkContent: HomeContent = {
  tagline: 'Mox is SICK AS HELL!! A space for rebels, makers, and absolute legends.',
  subtitle: '1680 Mission St, SF — come thru',
  location: 'https://maps.google.com/?q=Mox+1680+Mission+St+San+Francisco',
  communityTitle: 'Cool people you\'ll meet:',
  communityImage: '/images/014.jpg',
  communityTags: [
    'AI safety punks',
    'Startup anarchists',
    'Tech accelerationists',
    'Underground filmmakers',
    'Zine writers',
    'Nonprofit rebels',
    'DIY creators',
    'Card sharks',
    'Policy hackers',
    'Community organizers',
    'Chaotic good nerds',
  ],
  communityLink: 'Assholes you\'ll meet here ↓',
  offersTitle: 'What we got',
  offersImage: '/images/005.jpg',
  offersText:
    'Space for your sh*t! Deep work vibes! A community that actually gives a damn! Events that don\'t suck!',
  ctaButtons: {
    primary: { text: 'GET IN', href: '/membership' },
    secondary: { text: 'Office space??', href: 'mailto:robin@moxsf.com' },
    tertiary: { text: 'Day pass', href: '/day-pass' },
  },
  eventsTitle: 'THINGS GOING ON',
  eventsSubtitle: 'Stuff happening rn',
  peopleTitle: 'THE HUMANS',
  peopleSubtitle: 'These people are cool as hell',
  galleryTitle: 'THE SPACE',
  gallerySubtitle: 'Look at this sick space',
  footerText: 'Powered by Manifund',
  footerContact: 'robin@moxsf.com',
}

export const dinosaurContent: HomeContent = {
  tagline: 'An incubator where dinosaurs (metaphorically) help you build the future!',
  subtitle: '1680 Mission Street, San Francisco',
  location: 'https://maps.google.com/?q=Mox+1680+Mission+St+San+Francisco',
  communityTitle: 'The fellow dinosaurs you\'ll meet:',
  communityImage: '/images/014.jpg',
  communityTags: [
    'T-Rex startup founders',
    'Velociraptor researchers', 
    'Stegosaurus builders',
    'Pterodactyl visionaries',
    'Triceratops makers',
    'Brachiosaurus thinkers',
  ],
  communityLink: 'See all the dinosaurs!',
  offersTitle: 'What Mox offers',
  offersImage: '/images/005.jpg',
  offersText:
    'A prehistoric space for modern work! Community! Events! Everything a dinosaur needs to thrive in the 21st century!',
  ctaButtons: {
    primary: { text: 'Join the herd!', href: '/membership' },
    secondary: { text: 'Inquire about caves', href: 'mailto:robin@moxsf.com' },
    tertiary: { text: 'Day pass for dinos', href: '/day-pass' },
  },
  eventsTitle: 'Dinosaur Gatherings',
  eventsSubtitle: 'When dinosaurs convene',
  peopleTitle: 'Our Dinosaurs',
  peopleSubtitle: 'The prehistoric crew',
  galleryTitle: 'The Habitat',
  gallerySubtitle: 'Where dinosaurs roam',
  footerText: 'A project of Manifund',
  footerContact: 'robin@moxsf.com',
}

export const oldeContent: HomeContent = {
  tagline: 'A Guild Hall for Craftſmen & Scholarſ of Moſt Excellent Charaƈter',
  subtitle: 'XVI·LXXX Miſsion Street, San Franciſco',
  location: 'https://maps.google.com/?q=Mox+1680+Mission+St+San+Francisco',
  communityTitle: 'Ye Eſteemed Members of Our Guild:',
  communityImage: '/images/014.jpg',
  communityTags: [
    'Alchymiſts of Artificiall Intelligence',
    'Maſters of Enterpriſe',
    'Scribes & Chroniclers',
    'Artificers & Inventors',
    'Philoſophers of Policy',
    'Builders of ye Commons',
    'Keepers of Wiſdom',
  ],
  communityLink: 'Behold ye Full Roſter of Guild Members ↓',
  offersTitle: 'What ye Guild Provideth',
  offersImage: '/images/005.jpg',
  offersText:
    'A moſt Noble Hall for Deep Contemplation, a Brotherhood of Learned Perſons, and Gatherings of Great Purpoſe. All manner of Accomodations for ye Purſuit of Excellence.',
  ctaButtons: {
    primary: { text: 'Petition for Memberſhip', href: '/membership' },
    secondary: { text: 'Enquire About Chambers', href: 'mailto:robin@moxsf.com' },
    tertiary: { text: 'Day Paſs for Viѕitors', href: '/day-pass' },
  },
  eventsTitle: 'Gatherings & Feaſts',
  eventsSubtitle: 'Wherein ye Guild Aſſembles',
  peopleTitle: 'Ye Good Folke of Mox',
  peopleSubtitle: 'A Moſt Diſtinguiſhed Company',
  galleryTitle: 'Ye Guild Hall',
  gallerySubtitle: 'A Glimſe into Our Noble Eſtabliſhment',
  footerText: 'A Venture of ye Manifund',
  footerContact: 'robin@moxsf.com',
}

export const csContent: HomeContent = {
  tagline: 'A Collaborative Research Facility and Workspace for Innovation',
  subtitle: '1680 Mission Street, San Francisco, CA 94103',
  location: 'https://maps.google.com/?q=Mox+1680+Mission+St+San+Francisco',
  communityTitle: 'Research Areas and Affiliations',
  communityImage: '/images/014.jpg',
  communityTags: [
    'Artificial Intelligence',
    'Entrepreneurship',
    'Multimedia Production',
    'Technical Writing',
    'Public Policy',
    'Community Development',
    'Applied Research',
  ],
  communityLink: 'View complete member directory',
  offersTitle: 'Facilities and Resources',
  offersImage: '/images/005.jpg',
  offersText:
    'Mox provides workspace infrastructure, collaborative environment, and regular seminars. Suitable for individual research and group projects.',
  ctaButtons: {
    primary: { text: 'Application Form', href: '/membership' },
    secondary: { text: 'Contact for Office Space', href: 'mailto:robin@moxsf.com' },
    tertiary: { text: 'Day Pass Information', href: '/day-pass' },
  },
  eventsTitle: 'Seminars and Meetings',
  eventsSubtitle: 'Scheduled Activities',
  peopleTitle: 'Current Members',
  peopleSubtitle: 'Research staff and affiliates',
  galleryTitle: 'Facility Photos',
  gallerySubtitle: 'Laboratory and workspace images',
  footerText: 'Supported by Manifund',
  footerContact: 'robin@moxsf.com',
}
