// app/layout.js
import "@/styles/globals.css";
import ClientProvider from "../components/ClientProvider";
import AppChrome from "@/components/AppChrome";
import InviteModal from "@/components/InviteModal";
import ActiveRoomModal from "@/components/ActiveRoomModal";
import GlobalChallengeListener from "@/components/GlobalChallengeListener";
import GlobalChallengeModal from "@/components/GlobalChallengeModal";

export const metadata = {
  title: "Chess Master Online",
  description: "Chess Master online with Redux + Socket.io",
  // optionally add openGraph/twitter etc here later
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Stack+Sans+Notch:wght@200..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClientProvider>
          {/* global challenge listener + modal (mounted in client chrome) */}
          <GlobalChallengeListener />
          <GlobalChallengeModal />
          <AppChrome>{children}</AppChrome>
          <InviteModal />
        </ClientProvider>
      </body>
    </html>
  );
}

// // app/layout.js
// import "@/styles/globals.css";
// import ClientProvider from "../components/ClientProvider";
// import AppChrome from "@/components/AppChrome";
// import InviteModal from "@/components/InviteModal";
// import ActiveRoomModal from "@/components/ActiveRoomModal";
// import GlobalChallengeListener from "@/components/GlobalChallengeListener";
// import GlobalChallengeModal from "@/components/GlobalChallengeModal";

// export const metadata = {
//   title: "Chess Master Online",
//   description: "Chess Master online with Redux + Socket.io",
// };

// export default function RootLayout({ children }) {
//   return (
//     <html lang="en">
//       <head>
//         {/* Google Font - Montserrat */}
//         <link rel="preconnect" href="https://fonts.googleapis.com" />
//         <link
//           rel="preconnect"
//           href="https://fonts.gstatic.com"
//           crossOrigin="anonymous"
//         />
//         <link
//           href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap"
//           rel="stylesheet"
//         />
//       </head>

//       <body className="font-montserrat">
//         <ClientProvider>
//           <GlobalChallengeListener />
//           <GlobalChallengeModal />
//           <AppChrome>{children}</AppChrome>
//           <InviteModal />
//         </ClientProvider>
//       </body>
//     </html>
//   );
// }
