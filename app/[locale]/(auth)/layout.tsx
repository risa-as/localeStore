export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 py-10 bg-gradient-to-br from-orange-50 via-background to-amber-50/40 dark:from-background dark:to-background">
      {children}
    </div>
  );
}
