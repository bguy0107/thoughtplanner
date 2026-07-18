import { betterAuth, APIError } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.js'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  plugins: [
    // Exposes /api/auth/admin/* (list/ban/unban/set-role/revoke-sessions) gated on
    // role — reuses our existing ADMIN/EDITOR/VIEWER enum instead of a separate one.
    admin({ defaultRole: 'EDITOR', adminRoles: ['ADMIN'] }),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh if older than 1 day
  },
  user: {
    additionalFields: {
      // Without this, better-auth strips the Prisma `role` column from
      // session.user since it isn't part of its core user schema — role
      // checks on the API would silently see `undefined` for everyone.
      role: {
        type: 'string',
        required: false,
        defaultValue: 'EDITOR',
        input: false, // never settable from signup/update-user requests
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Gate self-service sign-up behind ALLOW_SIGNUP so a random visitor can't
        // create an account and get full EDITOR access to every page. The very
        // first account (workspace owner) is always allowed through and promoted
        // to ADMIN. A pending invite (matched by email) bypasses ALLOW_SIGNUP and
        // sets the role the admin picked when generating the invite link.
        async before(user) {
          const existingUsers = await prisma.user.count()

          if (existingUsers === 0) {
            return { data: { ...user, role: 'ADMIN' } }
          }

          const invite = await prisma.invite.findFirst({
            where: { email: user.email, usedAt: null },
          })

          if (invite) {
            return { data: { ...user, role: invite.role } }
          }

          if (process.env.ALLOW_SIGNUP !== 'true') {
            throw new APIError('FORBIDDEN', {
              message: 'Public sign-up is disabled. Ask a workspace admin to invite you.',
            })
          }

          return { data: { ...user, role: 'EDITOR' } }
        },
        // Marks the invite consumed now that the user record actually exists —
        // creation could still fail after `before` (e.g. duplicate email), so
        // this must not happen until we know the account was really created.
        async after(user) {
          await prisma.invite.updateMany({
            where: { email: user.email, usedAt: null },
            data: { usedAt: new Date(), usedById: user.id },
          })
        },
      },
    },
  },
  trustedOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
})

export type Auth = typeof auth
