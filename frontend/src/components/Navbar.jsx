import { NavLink } from "react-router-dom";
import { GearIcon } from "./Icons.jsx";
import "../css/index.css";

function Navbar() {
  return (
    <nav>
      <NavLink to="/" end>
        Home
      </NavLink>
      <NavLink to="/queue">Queue</NavLink>
      <NavLink to="/studio">Studio</NavLink>
      <NavLink to="/practice">Practice</NavLink>
      <NavLink
        to="/settings"
        className="nav-icon-link"
        title="Settings"
        aria-label="Settings"
      >
        <GearIcon />
      </NavLink>
    </nav>
  );
}

export default Navbar;
