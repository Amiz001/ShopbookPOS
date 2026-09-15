-- =========================================================================
-- Entitlement realtime: push a broadcast to every device of a business the
-- moment the RevenueCat webhook writes `subscriptions`, so a purchase made on
-- one device unlocks Pro on the others without waiting for a foreground
-- refresh.
--
-- Topic: `entitlement:{business_id}` (private). The existing realtime.messages
-- policies already gate `{prefix}:{business_id}` topics on business
-- membership, so the same rule covers this prefix.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.broadcast_entitlement_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_phone text;
  biz record;
BEGIN
  SELECT o.phone INTO owner_phone FROM public.owners o WHERE o.id = NEW.owner_id;
  IF owner_phone IS NULL THEN
    RETURN NEW;
  END IF;

  FOR biz IN
    SELECT b.id
    FROM public.businesses b
    WHERE public.normalize_phone_pg(b.phone_number) = owner_phone
  LOOP
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object(
          'ownerId',   NEW.owner_id,
          'isActive',  NEW.is_active,
          'expiresAt', NEW.expires_at,
          'updatedAt', NEW.updated_at),
        'entitlement_changed',
        'entitlement:' || biz.id,
        true);
    EXCEPTION WHEN OTHERS THEN
      -- Never let a realtime hiccup roll back the webhook's write.
      RAISE WARNING 'entitlement broadcast failed for business %: %', biz.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_broadcast_entitlement ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_broadcast_entitlement
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_entitlement_change();
