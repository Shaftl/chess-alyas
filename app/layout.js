import "@/styles/globals.css";
import ClientProvider from "../components/ClientProvider";
import AppChrome from "@/components/AppChrome";
import InviteModal from "@/components/InviteModal";

export const metadata = {
  title: "Chess Master Online",
  description: "Chess Master online with Redux + Socket.io",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="true"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Stack+Sans+Notch:wght@200..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClientProvider>
          <AppChrome>{children}</AppChrome>
          <InviteModal />
        </ClientProvider>
      </body>
    </html>
  );
}
