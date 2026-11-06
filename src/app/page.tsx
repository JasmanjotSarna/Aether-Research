import React from 'react';
import { SmoothScroll } from '@/components/marketing/SmoothScroll';
import { IntroAnimation } from '@/components/marketing/IntroAnimation';
import { Navbar } from '@/components/marketing/Navbar';
import { Hero } from '@/components/marketing/Hero';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { PipelineVisual } from '@/components/marketing/PipelineVisual';
import { ReportPreview } from '@/components/marketing/ReportPreview';
import { HorizontalRail } from '@/components/marketing/HorizontalRail';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import { Footer } from '@/components/marketing/Footer';
import { LiquidDivider } from '@/components/ui/LiquidDivider';

export default function MarketingPage() {
  return (
    <SmoothScroll>
      {/* Intro Animation (First visit of session, ~2.4s, skippable) */}
      <IntroAnimation />

      <main className="flex-1 flex flex-col justify-between pt-6">
        <Navbar />

        <div className="flex-1 space-y-12 md:space-y-20">
          <Hero />

          <LiquidDivider />

          <FeatureGrid />

          <LiquidDivider flip />

          <HowItWorks />

          <PipelineVisual />

          <LiquidDivider />

          <ReportPreview />

          <HorizontalRail />

          <FaqAccordion />
        </div>

        <Footer />
      </main>
    </SmoothScroll>
  );
}
