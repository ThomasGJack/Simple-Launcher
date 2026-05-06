// Orchestrateur des sections de la single-page.
// Chaque section vit dans son propre fichier sous `./sections/`.
// L'ordre ci-dessous = l'ordre rendu vertical.

import { CrewHero } from "./sections/01-CrewHero";
import { Manifesto } from "./sections/02-Manifesto";
import { ProfileDemo } from "./sections/03-ProfileDemo";
import { LibraryDemo } from "./sections/04-LibraryDemo";
import { CommunityHeatmap } from "./sections/05-CommunityHeatmap";
import { AchievementsGallery } from "./sections/06-AchievementsGallery";
import { TiersShowcase } from "./sections/07-TiersShowcase";
import { LauncherMockup } from "./sections/08-LauncherMockup";
import { HowItWorks } from "./sections/09-HowItWorks";
import { Faq } from "./sections/10-Faq";
import { DownloadCta } from "./sections/11-DownloadCta";
import { Footer } from "./sections/12-Footer";

export default function App() {
  return (
    <main className="relative">
      <CrewHero />
      <Manifesto />
      <ProfileDemo />
      <LibraryDemo />
      <CommunityHeatmap />
      <AchievementsGallery />
      <TiersShowcase />
      <LauncherMockup />
      <HowItWorks />
      <Faq />
      <DownloadCta />
      <Footer />
    </main>
  );
}
