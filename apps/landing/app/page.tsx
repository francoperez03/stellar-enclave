import { HeroSection } from "@/components/sections/HeroSection";
import { ProblemSection } from "@/components/sections/ProblemSection";
import { HowItWorks } from "@/components/sections/HowItWorks";

export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <ProblemSection />
      <HowItWorks />
    </main>
  );
}
