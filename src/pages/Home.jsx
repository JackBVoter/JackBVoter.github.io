import { Card, Button, Badge } from 'react-bootstrap'
import { Link } from 'react-router-dom'

function Home() {
  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Badge bg="success" className="mb-2">
          Deployed successfully
        </Badge>
        <Card.Title>Pokémon Showdown Stats</Card.Title>
        <Card.Text>
          If you can see this on <code>jackbvoter.github.io</code>, the GitHub
          Pages pipeline works. This is a placeholder home page built with React,
          React-Bootstrap, and React Router (declarative mode).
        </Card.Text>
        <Card.Text className="text-muted">
          Next we&apos;ll add a search box for a Showdown username and start
          pulling replay data.
        </Card.Text>
        <Button as={Link} to="/about" variant="primary">
          Go to the About page
        </Button>
      </Card.Body>
    </Card>
  )
}

export default Home
