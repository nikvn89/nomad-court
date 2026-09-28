import { Link, NavLink } from 'react-router-dom';
import { Scale } from 'lucide-react';
import ConnectButton from './ConnectButton';

interface Props {
  account: string | null;
  busy: boolean;
  onConnect: () => void;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm ${
    isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-100'
  }`;

export default function Navbar({ account, busy, onConnect }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-900 bg-gray-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-white">
          <Scale size={20} className="text-indigo-400" />
          <span className="text-lg font-bold">NomadCourt</span>
        </Link>

        <div className="flex items-center gap-1">
          <NavLink to="/" end className={linkClass}>
            Explorer
          </NavLink>
          <NavLink to="/dashboard" className={linkClass}>
            My cases
          </NavLink>
          <NavLink to="/dispute/new" className={linkClass}>
            File a case
          </NavLink>
        </div>

        <div className="ml-auto">
          <ConnectButton account={account} busy={busy} onConnect={onConnect} />
        </div>
      </nav>
    </header>
  );
}
