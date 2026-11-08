import { Link } from "react-router-dom";
import "../css/index.css";

function Navbar() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/queue">Queue</Link>
      <Link to="/studio">Studio</Link>
      <Link to="/settings">Settings</Link>
    </nav>
  );
}

export default Navbar;
