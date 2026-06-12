import Footer from "@/components/footer";
import Header from "@/components/shared/header";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}
