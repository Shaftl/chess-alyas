// app/sitemap.js
export default function sitemap() {
  // replace and add all important pages
  return [
    {
      url: "https://chess-alyas.vercel.app",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://chess-alyas.vercel.app/players",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: "https://chess-alyas.vercel.app/play",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: "https://chess-alyas.vercel.app/auth/login",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: "https://chess-alyas.vercel.app/auth/register",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    // add other pages you want Google to see
  ];
}
