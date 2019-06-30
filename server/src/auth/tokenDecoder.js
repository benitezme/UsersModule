/*
   JSON Web Token (JWT) is a compact, URL-safe means of representing
   claims to be transferred between two parties.  The claims in a JWT
   are encoded as a JSON object that is used as the payload of a JSON
   Web Signature (JWS) structure or as the plaintext of a JSON Web
   Encryption (JWE) structure, enabling the claims to be digitally
   signed or integrity protected with a Message Authentication Code
   (MAC) and/or encrypted.
*/

const JSONWebToken = require('jsonwebtoken') // A library to deal with JSON Web Tokens.
const webTokenLibrary = require('jwks-rsa')   // A library to retrieve RSA signing keys from a JWKS (JSON Web Key Set) endpoint.
const util = require('util')
import logger from '../logger'

async function decodeToken(token) {
  try {
    logger.debug('decodeToken -> Entering function.')

    const decoded = JSONWebToken.decode(token, { complete: true })
    const header = decoded.header
    const payload = decoded.payload

    if (header === null || header.kid === null || payload === null) {
      logger.error('decodeToken -> Invalid Token. ' + token)
      throw 'Invalid Token: ' + token
    }

    const client = webTokenLibrary({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 1,
      jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
    })
    client.getSigningKeyAsync = util.promisify(client.getSigningKey);
    client.getSigningKeysAsync = util.promisify(client.getSigningKeys);
    client.getKeysAsync = util.promisify(client.getKeys);

    let key = await client.getSigningKeyAsync(header.kid)

    let verified = await new Promise(function (resolve, reject) {
      JSONWebToken.verify(token, key.publicKey, { algorithms: ['RS256'] }, function (err, decode) {
        if (err) {
          reject(err)
          return
        }
        resolve(decode)
      })
    })

    return verified
  } catch (err) {
    logger.error('decodeToken -> err = ' + err)
    throw err
  }
}

export default decodeToken
