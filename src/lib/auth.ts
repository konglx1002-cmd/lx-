import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

import { prisma } from "@/lib/prisma";
import { DEFAULT_TIME_ZONE, timeZoneInputSchema } from "@/lib/time-zone";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      timeZone: {
        type: "string",
        required: true,
        defaultValue: DEFAULT_TIME_ZONE,
        validator: {
          input: timeZoneInputSchema,
        },
      },
    },
  },
});
