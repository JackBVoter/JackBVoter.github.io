import { Routes, Route, Link } from 'react-router-dom'
import { Navbar, Container } from 'react-bootstrap'

import Home from './pages/Home.jsx'
import Player from './pages/Player.jsx'
import './App.css'

function App() {
  return (
    <>
      {/* No nav links: "Home" only repeated the brand, which already links
          there, and "About" was scaffold text. With nothing to collapse, the
          toggle and collapse wrapper go too — and so does `expand`, which only
          existed to drive them. */}
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand as={Link} to="/">
            Pokémon Showdown Stats
          </Navbar.Brand>
        </Container>
      </Navbar>

      <Container className="py-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/player/:userId" element={<Player />} />
        </Routes>
      </Container>
    </>
  )
}

export default App
