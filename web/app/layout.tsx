import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'CardioSight 3D', description: 'Vessel-level coronary artery disease risk on an interactive 3D heart' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-slate-800">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg">🫀 CardioSight 3D</Link>
            <Link href="/" className="text-sm text-slate-400 hover:text-white">Assess</Link>
            <Link href="/evaluation" className="text-sm text-slate-400 hover:text-white">Evaluation</Link>
            <span className="ml-auto text-xs text-slate-500">Educational tool — not a diagnostic device</span>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
