-- Case facts (customer_journey_ux_review §3): the free-check answers used to be
-- hard-deleted at purchase; they now live on the case and are shown back.
ALTER TABLE "Case" ADD COLUMN "facts" JSONB;
