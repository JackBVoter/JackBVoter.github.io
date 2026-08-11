import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, InputGroup, Spinner } from 'react-bootstrap'

import { toUserId, userExists } from '../api/showdown.js'

/**
 * Username input that checks the name before routing to /player/:userId.
 *
 * The check is necessary rather than defensive: Showdown's user endpoint
 * returns a normal-looking 200 body for names that don't exist, so without
 * userExists() every typo would open an empty dashboard instead of saying so.
 */
function SearchBar({ autoFocus = false, size = 'lg', showHint = true }) {
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const navigate = useNavigate()

  const abortRef = useRef(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const userId = toUserId(value)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!userId || checking) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setChecking(true)
    setNotFound(false)

    try {
      const { exists } = await userExists(userId, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (exists) {
        // No format param: a typed name is a fresh, unscoped lookup. Carrying
        // the previous player's format over would silently scope someone new to
        // a format they may never have played.
        navigate(`/player/${userId}`)
        // This component stays mounted when navigating player -> player, so
        // clear the box rather than leaving the previous query sitting in it.
        setValue('')
      } else {
        setNotFound(true)
      }
    } catch {
      // A network failure isn't the same as "no such user", but from here the
      // only honest thing to say is that we couldn't confirm the name.
      if (!controller.signal.aborted) setNotFound(true)
    } finally {
      if (!controller.signal.aborted) setChecking(false)
    }
  }

  return (
    <Form onSubmit={handleSubmit}>
      <InputGroup size={size}>
        <Form.Control
          type="search"
          placeholder="search a player"
          aria-label="Showdown username"
          value={value}
          autoFocus={autoFocus}
          isInvalid={notFound}
          onChange={(event) => {
            setValue(event.target.value)
            if (notFound) setNotFound(false)
          }}
        />
        <Button type="submit" variant="primary" disabled={!userId || checking}>
          {checking ? (
            <>
              <Spinner as="span" animation="border" size="sm" className="me-2" />
              Checking
            </>
          ) : (
            'Search'
          )}
        </Button>
      </InputGroup>

      {notFound ? (
        <div className="text-danger small mt-1" role="alert">
          user not found
        </div>
      ) : showHint ? (
        <Form.Text className="text-muted">
          Only publicly uploaded replays can be analyzed.
        </Form.Text>
      ) : null}
    </Form>
  )
}

export default SearchBar
