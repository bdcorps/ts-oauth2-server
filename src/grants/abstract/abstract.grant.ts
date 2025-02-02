import { AuthorizationServerOptions } from "../../authorization_server";
import { isClientConfidential, OAuthClient } from "../../entities/client.entity";
import { OAuthScope } from "../../entities/scope.entity";
import { OAuthToken } from "../../entities/token.entity";
import { OAuthUser } from "../../entities/user.entity";
import { OAuthException } from "../../exceptions/oauth.exception";
import { OAuthTokenRepository } from "../../repositories/access_token.repository";
import { OAuthAuthCodeRepository } from "../../repositories/auth_code.repository";
import { OAuthClientRepository } from "../../repositories/client.repository";
import { OAuthScopeRepository } from "../../repositories/scope.repository";
import { ExtraAccessTokenFields, OAuthUserRepository } from "../../repositories/user.repository";
import { AuthorizationRequest } from "../../requests/authorization.request";
import { RequestInterface } from "../../requests/request";
import { BearerTokenResponse } from "../../responses/bearer_token.response";
import { OAuthResponse, ResponseInterface } from "../../responses/response";
import { arrayDiff } from "../../utils/array";
import { base64decode } from "../../utils/base64";
import { DateInterval } from "../../utils/date_interval";
import { JwtInterface } from "../../utils/jwt";
import { getSecondsUntil, roundToSeconds } from "../../utils/time";
import { GrantIdentifier, GrantInterface } from "./grant.interface";

export interface ITokenData {
  iss: undefined;
  sub: string | undefined;
  aud: undefined;
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  cid: string;
  scope: string;
  [key: string]: unknown;
}

export abstract class AbstractGrant implements GrantInterface {
  public readonly options: AuthorizationServerOptions = {
    requiresPKCE: true,
    requiresS256: false,
    notBeforeLeeway: 0,
    tokenCID: "name",
  };

  protected readonly scopeDelimiterString = " ";

  protected readonly supportedGrantTypes: GrantIdentifier[] = [
    "client_credentials",
    "authorization_code",
    "refresh_token",
    "password",
    "implicit",
  ];

  abstract readonly identifier: GrantIdentifier;

  constructor(
    protected readonly authCodeRepository: OAuthAuthCodeRepository,
    protected readonly clientRepository: OAuthClientRepository,
    protected readonly tokenRepository: OAuthTokenRepository,
    protected readonly scopeRepository: OAuthScopeRepository,
    protected readonly userRepository: OAuthUserRepository,
    protected readonly jwt: JwtInterface,
  ) { }

  async makeBearerTokenResponse(
    client: OAuthClient,
    accessToken: OAuthToken,
    scopes: OAuthScope[] = [],
    extraJwtFields: ExtraAccessTokenFields = {},
  ) {
    const scope = scopes.map(scope => scope.name).join(this.scopeDelimiterString);

    const encryptedAccessToken = await this.encryptAccessToken(client, accessToken, scopes, extraJwtFields);

    let encryptedRefreshToken: string | undefined = undefined;

    if (accessToken.refreshToken) {
      encryptedRefreshToken = await this.encryptRefreshToken(client, accessToken, scopes);
    }

    const bearerTokenResponse = new BearerTokenResponse(accessToken);

    bearerTokenResponse.body = {
      token_type: "Bearer",
      expires_in: getSecondsUntil(accessToken.accessTokenExpiresAt),
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      scope,
    };

    return bearerTokenResponse;
  }

  protected encryptRefreshToken(client: OAuthClient, refreshToken: OAuthToken, scopes: OAuthScope[]) {
    const expiresAtMs = refreshToken.refreshTokenExpiresAt?.getTime() ?? refreshToken.accessTokenExpiresAt.getTime();
    return this.encrypt({
      client_id: client.id,
      access_token_id: refreshToken.accessToken,
      refresh_token_id: refreshToken.refreshToken,
      scope: scopes.map(scope => scope.name).join(this.scopeDelimiterString),
      user_id: refreshToken.user?.id,
      expire_time: Math.ceil(expiresAtMs / 1000),
      // token_version: 1, // @todo token version?
    });
  }

  protected encryptAccessToken(
    client: OAuthClient,
    accessToken: OAuthToken,
    scopes: OAuthScope[],
    extraJwtFields: ExtraAccessTokenFields,
  ) {
    const now = Date.now();
    return this.encrypt(<ITokenData>{
      // optional claims which the `userRepository.extraAccessTokenFields()` method may overwrite
      iss: undefined, // @see https://tools.ietf.org/html/rfc7519#section-4.1.1
      aud: undefined, // @see https://tools.ietf.org/html/rfc7519#section-4.1.3

      // the contents of `userRepository.extraAccessTokenFields()`
      ...extraJwtFields,

      // non-standard claims over which this library asserts control
      cid: client[this.options.tokenCID],
      scope: scopes.map(scope => scope.name).join(this.scopeDelimiterString),

      // standard claims over which this library asserts control
      sub: accessToken.user?.id, // @see https://tools.ietf.org/html/rfc7519#section-4.1.2
      exp: roundToSeconds(accessToken.accessTokenExpiresAt.getTime()), // @see https://tools.ietf.org/html/rfc7519#section-4.1.4
      nbf: roundToSeconds(now) - this.options.notBeforeLeeway, // @see https://tools.ietf.org/html/rfc7519#section-4.1.5
      iat: roundToSeconds(now), // @see https://tools.ietf.org/html/rfc7519#section-4.1.6
      jti: accessToken.accessToken, // @see https://tools.ietf.org/html/rfc7519#section-4.1.7
    });
  }

  protected async validateClient(request: RequestInterface): Promise<OAuthClient> {
    const [clientId, clientSecret] = this.getClientCredentials(request);

    const grantType = this.getGrantType(request);

    const client = await this.clientRepository.getByIdentifier(clientId);

    if (isClientConfidential(client) && !clientSecret) {
      throw OAuthException.invalidClient("Confidential clients require client_secret.");
    }

    const userValidationSuccess = await this.clientRepository.isClientValid(grantType, client, clientSecret);

    if (!userValidationSuccess) {
      throw OAuthException.invalidClient();
    }

    return client;
  }

  protected getClientCredentials(request: RequestInterface): [string, string | undefined] {
    const [basicAuthUser, basicAuthPass] = this.getBasicAuthCredentials(request);

    let clientId = this.getRequestParameter("client_id", request, basicAuthUser);

    if (!clientId) {
      throw OAuthException.invalidParameter("client_id");
    }

    let clientSecret = this.getRequestParameter("client_secret", request, basicAuthPass);

    if (Array.isArray(clientId) && clientId.length > 0) clientId = clientId[0];

    if (Array.isArray(clientSecret) && clientSecret.length > 0) clientSecret = clientSecret[0];

    return [clientId, clientSecret];
  }

  protected getBasicAuthCredentials(request: RequestInterface) {
    if (!request.headers?.hasOwnProperty("authorization")) {
      return [undefined, undefined];
    }

    const header = request.headers["authorization"];

    if (!header || !header.startsWith("Basic ")) {
      return [undefined, undefined];
    }

    const decoded = base64decode(header.substr(6, header.length));

    if (!decoded.includes(":")) {
      return [undefined, undefined];
    }

    return decoded.split(":");
  }

  protected async validateScopes(
    scopes: undefined | string | string[] = [],
    redirectUri?: string,
  ): Promise<OAuthScope[]> {
    if (typeof scopes === "string") {
      scopes = scopes.split(this.scopeDelimiterString);
    }

    if (!scopes || scopes.length === 0 || scopes[0] === "") {
      return [];
    }

    const validScopes = await this.scopeRepository.getAllByIdentifiers(scopes);

    const invalidScopes = arrayDiff(
      scopes,
      validScopes.map(scope => scope.name),
    );

    if (invalidScopes.length > 0) {
      throw OAuthException.invalidScope(invalidScopes.join(", "), redirectUri);
    }

    return validScopes;
  }

  protected async issueAccessToken(
    accessTokenTTL: DateInterval,
    client: OAuthClient,
    user?: OAuthUser | null,
    scopes: OAuthScope[] = [],
  ): Promise<OAuthToken> {
    const accessToken = await this.tokenRepository.issueToken(client, scopes, user);
    accessToken.accessTokenExpiresAt = accessTokenTTL.getEndDate();

    await this.tokenRepository.persist(accessToken);
    return accessToken;
  }

  issueRefreshToken(accessToken: OAuthToken, client: OAuthClient): Promise<OAuthToken> {
    return this.tokenRepository.issueRefreshToken(accessToken, client);
  }

  private getGrantType(request: RequestInterface): GrantIdentifier {
    const result =
      this.getRequestParameter("grant_type", request) ?? this.getQueryStringParameter("grant_type", request);

    if (!result || !this.supportedGrantTypes.includes(result)) {
      throw OAuthException.invalidParameter("grant_type");
    }

    if (this.identifier !== result) {
      throw OAuthException.invalidParameter("grant_type", "something went wrong"); // @todo remove the something went wrong
    }

    return result;
  }

  protected getRequestParameter(param: string, request: RequestInterface, defaultValue?: any) {
    return request.body?.[param] ?? defaultValue;
  }

  protected getQueryStringParameter(param: string, request: RequestInterface, defaultValue?: any) {
    return request.query?.[param] ?? defaultValue;
  }

  protected encrypt(unencryptedData: string | Buffer | Record<string, unknown>): Promise<string> {
    return this.jwt.sign(unencryptedData);
  }

  protected async decrypt(encryptedData: string) {
    return await this.jwt.verify(encryptedData);
  }

  validateAuthorizationRequest(_request: RequestInterface): Promise<AuthorizationRequest> {
    throw new Error("Grant does not support the request");
  }

  canRespondToAccessTokenRequest(request: RequestInterface): boolean {
    return this.getRequestParameter("grant_type", request) === this.identifier;
  }

  canRespondToAuthorizationRequest(_request: RequestInterface): boolean {
    return false;
  }

  canRespondToRevokeRequest(request: RequestInterface): boolean {
    return this.getRequestParameter("token_type_hint", request) === this.identifier;
  }

  async completeAuthorizationRequest(_authorizationRequest: AuthorizationRequest): Promise<ResponseInterface> {
    throw new Error("Grant does not support the request");
  }

  async respondToAccessTokenRequest(_req: RequestInterface, _accessTokenTTL: DateInterval): Promise<ResponseInterface> {
    throw new Error("Grant does not support the request");
  }

  async respondToRevokeRequest(request: RequestInterface): Promise<ResponseInterface> {
    const encryptedToken = this.getRequestParameter("token", request);

    if (!encryptedToken) {
      throw OAuthException.invalidParameter("token");
    }

    await this.doRevoke(encryptedToken);
    return new OAuthResponse();
  }

  protected async doRevoke(_encryptedToken: string): Promise<void> {
    // default: nothing to do, be quiet about it
    return;
  }

}
