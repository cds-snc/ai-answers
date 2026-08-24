export default function logoutHandler(req, res) {
  // Use Passport's logout method
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ ok: false, error: 'logout failed' });
    }

    // Destroy the session
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error('Session destroy error:', destroyErr);
      }
      res.status(200).json({ ok: true });
    });
  });
}
