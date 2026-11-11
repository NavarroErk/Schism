import { NavLink } from "react-router-dom";
import "../css/index.css";

function Navbar() {
  return (
    <nav>
      <NavLink to="/" end>
        Home
      </NavLink>
      <NavLink to="/queue">Queue</NavLink>
      <NavLink to="/studio">Studio</NavLink>
      <NavLink to="/settings">Settings</NavLink>
    </nav>
  );
}

export default Navbar;
