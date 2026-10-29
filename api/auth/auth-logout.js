import TrustedDeviceService from '../../services/TrustedDeviceService.js';

export default async function logoutHandler(req, res) {
  // Signing out also forgets this browser, so the next sign-in here asks for
  // a 2FA code. A failure here must not stop the sign-out.
  // Only when the user chose to sign out (forgetDevice: true). The client also
  // calls this when the session ends on its own (a 401, or its expiry timer),
  // and forgetting then would defeat the feature. Not tied to the session
  // being alive: on a shared computer the user may sign out after it expired.
  if (req.body?.forgetDevice === true) {
    try {
      await TrustedDeviceService.forget(req, res);
    } catch (e) {
      console.error('Failed to forget device on logout', e);
    }
  }

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
