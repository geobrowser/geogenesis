import { z } from 'zod';

/** Creating a space plugin on a DAO */
export const ZodSpacePluginCreated = z.object({
  daoAddress: z.string(),
  spaceAddress: z.string(),
});

export type SpacePluginCreated = z.infer<typeof ZodSpacePluginCreated>;

export const ZodSpacePluginCreatedStreamResponse = z.object({
  spacesCreated: z.array(ZodSpacePluginCreated).min(1),
});

/** Creating governance plugins on a DAO */
export const ZodGovernancePluginsCreated = z.object({
  daoAddress: z.string(),
  mainVotingAddress: z.string(),
  memberAccessAddress: z.string(),
});

export type GovernancePluginsCreated = z.infer<typeof ZodGovernancePluginsCreated>;

export const ZodGovernancePluginsCreatedStreamResponse = z.object({
  governancePluginsCreated: z.array(ZodGovernancePluginsCreated).min(1),
});

/** Creating personal space plugins on a DAO */
export const ZodPersonalPluginsCreated = z.object({
  daoAddress: z.string(),
  personalAdminAddress: z.string(),
  initialEditor: z.string(),
});

export type PersonalPluginsCreated = z.infer<typeof ZodPersonalPluginsCreated>;

export const ZodPersonalPluginsCreatedStreamResponse = z.object({
  personalPluginsCreated: z.array(ZodPersonalPluginsCreated).min(1),
});

/**
 *  "@data": {
    "spacesCreated": [
      {
        "daoAddress": "0x020eea7fbbc384c68fb44f78a292b96aa3f7431f",
        "spaceAddress": "0xfabc7aa09d0670f485b824fb59dc2a3360148503"
      }
    ],
    "proposalsProcessed": [
      {
        "contentUri": "ipfs://Qmd2rY352gxPVC9syrNTPJpzVADieQ4mPFBPohJRzfDEvD",
        "pluginAddress": "0xfabc7aa09d0670f485b824fb59dc2a3360148503"
      }
    ],
    "personalPluginsCreated": [
      {
        "daoAddress": "0x020eea7fbbc384c68fb44f78a292b96aa3f7431f",
        "personalAdminAddress": "0x88d436963ed9d265b0d84fa12cb20037abc24bf6",
        "initialEditor": "0x42de4e0f9cdfbbc070e25effac78f5e5ba820853"
      }
    ]
  }
 */
