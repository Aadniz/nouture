import { Button } from "../fragments/Button";
import { Box } from "../fragments/Elements";
import { useAllFilesAccess } from "../hooks/useAllFilesAccess";

/** Asks for "All files access", needed to sync and read the shared org folder. */
export const AccessBanner = () => {
  const { granted, request } = useAllFilesAccess();
  if (granted !== false) return null;

  return (
    <Box>
      <p>Nouture needs "All files access" to sync your org folder.</p>
      <p className="text-amethyst-smoke text-sm mt-1">
        The files stay in shared storage, so other editors can open them too.
      </p>
      <Button
        className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80 mt-2"
        onClick={request}
      >
        Grant access
      </Button>
    </Box>
  );
};
