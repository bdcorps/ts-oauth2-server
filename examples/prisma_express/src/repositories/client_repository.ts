import { GrantIdentifier, OAuthClient, OAuthClientRepository } from "@jmondi/oauth2-server";
import { Prisma } from "@prisma/client";

import { Client } from "../entities/client";

export class ClientRepository implements OAuthClientRepository {
  constructor(private readonly repo: Prisma.OAuthClientDelegate<"rejectOnNotFound">) { }

  async getByIdentifier(clientId: string): Promise<Client> {
    return new Client(
      await this.repo.findUniqueOrThrow({
        where: {
          id: clientId,
        },
        include: {
          scopes: true,
        },
      }),
    );
  }

  async isClientValid(grantType: GrantIdentifier, client: OAuthClient, clientSecret?: string): Promise<boolean> {
    if (client.secret && client.secret !== clientSecret) {
      return false;
    }
    return client.allowedGrants.includes(grantType);
  }
}
