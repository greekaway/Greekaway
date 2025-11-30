document.addEventListener('DOMContentLoaded', () => {
  const targets = [
    { id: 'profile-account', href: '/profile-account.html' },
    { id: 'profile-history', href: '/profile-history.html' },
    { id: 'profile-tickets', href: '/profile-tickets.html' },
    { id: 'profile-settings', href: '/profile-settings.html' },
    { id: 'profile-support', href: '/profile-support.html' },
    { id: 'profile-legal', href: '/profile-legal.html' },
    { id: 'profile-logout', href: '/logout' }
  ];

  targets.forEach(({ id, href }) => {
    const card = document.getElementById(id);
    if (!card) return;
    const navigate = () => { window.location.assign(href); };
    card.addEventListener('click', navigate);
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigate();
      }
    });
  });
});
