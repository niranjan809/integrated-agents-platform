import { homepageCtaScraper } from "./homepageCta.js";
import { pricingScraper } from "./pricing.js";
import { signupFlowScraper } from "./signupFlow.js";
import { integrationsScraper } from "./integrations.js";
import { marketplaceScraper } from "./marketplace.js";
import { partnersScraper } from "./partners.js";
import { producthuntScraper } from "./producthunt.js";
import { comparisonPagesScraper } from "./comparisonPages.js";
import { resourcesScraper } from "./resources.js";
import { careersGtmScraper } from "./careersGtm.js";
import { newsScraper } from "./news.js";
import { githubReleasesScraper } from "./githubReleases.js";
import { pressReleaseScraper } from "./pressRelease.js";
import { plgPagesScraper } from "./plgPages.js";
import { salesPagesScraper } from "./salesPages.js";
import { techStackScraper } from "./techStack.js";
import { personaTargetingScraper } from "./personaTargeting.js";
import { openSourceScraper } from "./openSource.js";
import type { Scraper } from "../types.js";

export const scrapers: Scraper[] = [
  homepageCtaScraper,
  pricingScraper,
  signupFlowScraper,
  integrationsScraper,
  marketplaceScraper,
  partnersScraper,
  producthuntScraper,
  comparisonPagesScraper,
  resourcesScraper,
  careersGtmScraper,
  newsScraper,
  githubReleasesScraper,
  pressReleaseScraper,
  plgPagesScraper,
  salesPagesScraper,
  techStackScraper,
  personaTargetingScraper,
  openSourceScraper,
];
