import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">MockMitra</Link>
        <nav>
          <NavLink to="/" end>Tests</NavLink>
          <NavLink to="/history">My results</NavLink>
          <NavLink to="/insights">Insights</NavLink>
          <NavLink to="/notebooks">Notebooks</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="spacer" />
        <span className="muted hide-sm">{user?.name}</span>
        <button className="btn ghost sm" onClick={() => { signOut(); nav('/login'); }}>Sign out</button>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
