import "dotenv/config";

import { AuthorizationServer, DateInterval, JwtService } from "@jmondi/oauth2-server";
import {
  handleExpressError,
  handleExpressResponse, requestFromExpress
} from "@jmondi/oauth2-server/dist/adapters/express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import Express, { json, urlencoded } from "express";
import { AuthCodeRepository } from "./repositories/auth_code_repository";
import { ClientRepository } from "./repositories/client_repository";
import { ScopeRepository } from "./repositories/scope_repository";
import { TokenRepository } from "./repositories/token_repository";
import { UserRepository } from "./repositories/user_repository";

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  const prisma = new PrismaClient();
  const authorizationServer = new AuthorizationServer(
    new AuthCodeRepository(prisma.oAuthAuthCode),
    new ClientRepository(prisma.oAuthClient),
    new TokenRepository(prisma.oAuthToken),
    new ScopeRepository(prisma.oAuthScope),
    new UserRepository(prisma.user),
    new JwtService(process.env.OAUTH_CODES_SECRET!),
  );
  authorizationServer.enableGrantTypes(
    ["authorization_code", new DateInterval("15m")],
    ["client_credentials", new DateInterval("1d")],
    "refresh_token",
    "password",
    "implicit",
  );

  const app = Express();

  app.use(json());
  app.use(urlencoded({ extended: false }));
  app.use(cors())

  app.get("/authorize", async (req: Express.Request, res: Express.Response) => {
    console.log(req.query)

    const email: string = String(req.query.email)
    const passwordHash: string = String(req.query.passwordHash)

    // const email: string = "sunnyashiin@gmail.com"
    // const passwordHash: string = "password"

    if (!email || !passwordHash) {
      return res.redirect(`/oauth?success=false`)
    }

    try {
      // Validate the HTTP request and return an AuthorizationRequest object.
      const authRequest = await authorizationServer.validateAuthorizationRequest(requestFromExpress(req));

      // The auth request object can be serialized and saved into a user's session.
      // You will probably want to redirect the user at this point to a login endpoint.


      // Once the user has logged in set the user on the AuthorizationRequest
      console.log("Once the user has logged in set the user on the AuthorizationRequest");


      const user = await prisma.user.findFirstOrThrow({
        where: {
          email,
          passwordHash
        },
        select: {
          id: true,
          email: true
        }
      })

      if (!user) {
        res.send("User not found")
      }

      console.log({ user })

      authRequest.user = user

      // At this point you should redirect the user to an authorization page.
      // This form will ask the user to approve the client and the scopes requested.

      // Once the user has approved or denied the client update the status
      // (true = approved, false = denied)
      authRequest.isAuthorizationApproved = true;

      // Return the HTTP redirect response
      const oauthResponse = await authorizationServer.completeAuthorizationRequest(authRequest);
      return handleExpressResponse(res, oauthResponse);
    } catch (e) {
      handleExpressError(e, res);
    }
  });

  app.post("/token", async (req: Express.Request, res: Express.Response) => {
    try {
      const oauthResponse = await authorizationServer.respondToAccessTokenRequest(req);
      return handleExpressResponse(res, oauthResponse);
    } catch (e) {
      handleExpressError(e, res);
      return;
    }
  });

  app.get("/", (_: Express.Request, res: Express.Response) => {
    res.json({
      success: true,
      POST: ["/authorize", "/token"],
    });
  });

  app.listen(PORT);

  console.log("app is listening on localhost", PORT);
}

bootstrap().catch(console.log);
