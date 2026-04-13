import { HeroSection } from "@/components/sections/HeroSection";
import { ProblemSection } from "@/components/sections/ProblemSection";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { ThreeOrgs } from "@/components/sections/ThreeOrgs";
import { TryItSection } from "@/components/sections/TryItSection";
import { Footer } from "@/components/sections/Footer";

export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <ProblemSection />
      <HowItWorks />
      <ThreeOrgs />
      <TryItSection />
      <Footer />
    </main>
  );
}
