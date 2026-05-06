/**
 * Section 12 — Footer. Pas un section component avec padding standard
 * — un footer dédié avec border-top + grille de liens + bar du bas.
 */
export function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-white/[0.06] py-12">
      <div className="container">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div>
            <a href="/" className="inline-flex items-center gap-3">
              <img src="/logo.png" alt="" className="size-9 rounded-lg" />
              <span className="flex flex-col leading-none">
                <span className="font-display text-base tracking-[0.12em] text-fg-primary">
                  SIMPLE LAUNCHER
                </span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-gold)]">
                  ★ Simple Games
                </span>
              </span>
            </a>
            <p className="mt-4 max-w-sm text-sm text-fg-muted">
              L'outil de la communauté Simple Games. Construit avec Rust et
              React. Pas de pub, pas de tracking, pas d'abonnement.
            </p>
          </div>

          {/* Produit */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-fg-dim">
              Produit
            </h4>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              <FooterLink href="#manifesto">La communauté</FooterLink>
              <FooterLink href="#library">Bibliothèque</FooterLink>
              <FooterLink href="#tiers">Tiers de soutien</FooterLink>
              <FooterLink href="#launcher">Sous le capot</FooterLink>
              <FooterLink href="/changelog.html">Changelog</FooterLink>
              <FooterLink href="/download/SimpleLauncher-Setup.exe">
                Télécharger
              </FooterLink>
            </ul>
          </div>

          {/* Communauté */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-fg-dim">
              Communauté
            </h4>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              <FooterLink href="#community">Bienvenue</FooterLink>
              <FooterLink href="#profile">Profils publics</FooterLink>
              <FooterLink href="#achievements">Achievements</FooterLink>
              <FooterLink href="#faq">FAQ</FooterLink>
            </ul>
          </div>

          {/* Légal */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-fg-dim">
              Légal
            </h4>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              <FooterLink href="/privacy.html">Confidentialité</FooterLink>
              <FooterLink href="/terms.html">Conditions</FooterLink>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.04] pt-6 text-xs text-fg-dim">
          <span>© 2026 Simple Games · Privé</span>
          <span>Construit avec Tauri, Rust, React et beaucoup de café.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        className="text-fg-muted transition hover:text-accent"
      >
        {children}
      </a>
    </li>
  );
}
