import logger from '../logger'
import _ from 'lodash'
import User from '../models/user'
import tokenDecoder from '../auth/tokenDecoder'

const graphql = require('graphql')

const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLSchema,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull
} = graphql // Destructuring this variables from inside the package.

let roles = [
  { id: '1', name: 'Not Defined' },
  { id: '2', name: 'Developer' },
  { id: '3', name: 'Trader' },
  { id: '4', name: 'Data Analyst' }
]

// Types

const UserType = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: GraphQLID },
    authId: { type: GraphQLString },
    referrerId: { type: GraphQLString },
    alias: { type: GraphQLString },
    firstName: { type: GraphQLString },
    middleName: { type: GraphQLString },
    lastName: { type: GraphQLString },
    bio: { type: GraphQLString },
    email: { type: GraphQLString },
    emailVerified: { type: GraphQLInt },
    isDeveloper: { type: GraphQLInt },
    isTrader: { type: GraphQLInt },
    isDataAnalyst: { type: GraphQLInt },
    avatarHandle: { type: GraphQLString },
    avatarChangeDate: { type: GraphQLString },
    sessionToken: { type: GraphQLString },
    role: {
      type: RoleType,
      resolve(parent, args) {
        return _.find(roles, { id: parent.roleId })
      }
    }
  })
})

const DescendentType = new GraphQLObjectType({
  name: 'Descendent',
  fields: () => ({
    id: { type: GraphQLID },
    referrerId: { type: GraphQLString },
    alias: { type: GraphQLString },
    firstName: { type: GraphQLString },
    middleName: { type: GraphQLString },
    lastName: { type: GraphQLString },
    descendents: {
      type: new GraphQLList(DescendentType),
      resolve(parent, args) {
        return User.find({ referrerId: parent.id })
      }
    }
  })
})

const RoleType = new GraphQLObjectType({
  name: 'Role',
  fields: () => ({
    id: { type: GraphQLID },
    name: { type: GraphQLString },
    users: {
      type: new GraphQLList(UserType),
      resolve(parent, args) {
        return User.find({ roleId: parent.id })
      }
    }
  })
})

// RootQueries

const RootQuery = new GraphQLObjectType({
  name: 'RootQueryType',
  fields: {
    user: {
      type: UserType,
      args: { id: { type: GraphQLID } },
      resolve(parent, args) {
        // Code to get data from data source.
        return User.findById(args.id)
      }
    },
    userByAuthId: {
      type: UserType,
      args: { authId: { type: GraphQLString } },
      async resolve(parent, args) {
        let user = await User.findOne({ authId: args.authId })
        return user
      }
    },
    role: {
      type: RoleType,
      args: { id: { type: GraphQLID } },
      resolve(parent, args) {
        // Code to get data from data source.
        return _.find(roles, { id: args.id })
      }
    },
    users: {
      type: new GraphQLList(UserType),
      resolve(parent, args) {
        return User.find({})
      }
    },
    roles: {
      type: new GraphQLList(RoleType),
      resolve(parent, args) {
        return roles
      }
    },
    usersSearch: {
      type: new GraphQLList(UserType),
      args: { alias: { type: GraphQLString }, firstName: { type: GraphQLString }, middleName: { type: GraphQLString }, lastName: { type: GraphQLString } },
      resolve(parent, args) {
        logger.debug('RootQuery -> usersSearch -> resolve -> Entering function.')

        let mongoQuery = { $or: [] }

        if (args.alias !== null && args.alias !== '') { mongoQuery.$or.push({ alias: args.alias }) }
        if (args.firstName !== null && args.firstName !== '') { mongoQuery.$or.push({ firstName: args.firstName }) }
        if (args.middleName !== null && args.middleName !== '') { mongoQuery.$or.push({ middleName: args.middleName }) }
        if (args.lastName !== null && args.lastName !== '') { mongoQuery.$or.push({ lastName: args.lastName }) }

        if (mongoQuery.$or.length === 0) { mongoQuery = {} }

        return User.find(mongoQuery)
      }
    },
    descendents: {
      type: new GraphQLList(DescendentType),
      args: { id: { type: GraphQLString } },
      resolve(parent, args) {
        logger.debug('RootQuery -> descendents -> resolve -> Entering function.')

        return User.find({ referrerId: args.id })
      }
    }
  }
})

// Mutations

const Mutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    authenticate: {
      type: UserType,
      args: {
        idToken: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(parent, args) {
        logger.debug('authenticate -> Entering function.')
        let authenticateResponse = await authenticate(args.idToken)
        return authenticateResponse
      }
    },
    updateUser: {
      type: UserType,
      args: {
        firstName: { type: GraphQLString },
        middleName: { type: GraphQLString },
        lastName: { type: GraphQLString },
        bio: { type: GraphQLString },
        isDeveloper: { type: GraphQLInt },
        isTrader: { type: GraphQLInt },
        isDataAnalyst: { type: GraphQLInt },
        roleId: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve(parent, args, context) {
        let key = {
          _id: context.userId
        }

        let updatedUser = {
          firstName: args.firstName,
          middleName: args.middleName,
          lastName: args.lastName,
          bio: args.bio,
          isDeveloper: args.isDeveloper,
          isTrader: args.isTrader,
          isDataAnalyst: args.isDataAnalyst,
          roleId: args.roleId
        }

        return User.update(key, updatedUser)
      }
    },
    updateUserReferrer: {
      type: UserType,
      args: {
        referrerId: { type: GraphQLString }
      },
      resolve(parent, args, context) {
        let key = {
          _id: context.userId,
          referrerId: null
        }

        let updatedUser = {
          referrerId: args.referrerId
        }

        return User.update(key, updatedUser)
      }
    },
    updateSessionToken: {
      type: UserType,
      args: {
        userId: { type: GraphQLString },
        sessionToken: { type: GraphQLString }
      },
      resolve(parent, args) {
        let key = {
          _id: decodeURI(args.userId)
        }

        let updatedUser = {
          sessionToken: args.sessionToken
        }

        return User.update(key, updatedUser)
      }
    }
  }
})

async function authenticate(encodedToken) {
  try {
    logger.debug('authenticate -> Entering function.')

    let authId = ''
    let alias = ''
    let email = ''
    let emailVerified = false

    let decodedToken = await tokenDecoder(encodedToken)

    /*

    Ok, the user was correctly authenticated. Next we need to know if this logged in user
    has already been added to this module's database or not yet.

    */

    authId = decodedToken.sub
    alias = decodedToken.nickname
    email = decodedToken.email
    emailVerified = decodedToken.email_verified

    let user = await User.findOne({ authId: authId })

    if (user) {
      logger.debug('authenticate -> User already exists at database.')
      return { authId: authId, alias: user.alias }
    } else {
      logger.debug('authenticate -> User does not exist at database.')

      /*

      The authenticated user is NOT at our module database. We need to add him.
      We will take from the authentication provider the basic information it knows about the logged in users
      and save it as an initial set of data, which can later be modified.

      */

      /* The user can sign up with many different possible social accounts. Currently this module only supports Github only. */

      let authArray = authId.split('|')
      let socialAccountProvider = authArray[0]

      if (socialAccountProvider !== 'github' && socialAccountProvider !== 'auth0') {
        logger.error('authenticate -> Social Account Provider not Supoorted: ' + socialAccountProvider)
        throw 'authenticate -> Social Account Provider not Supoorted: ' + socialAccountProvider
      }

      let localDate = new Date()
      let creationDate = localDate.valueOf()

      let newUser = new User({
        alias: alias,
        authId: authId,
        creationDate: creationDate,
        email: email,
        emailVerified: emailVerified,
        roleId: '1'
      })

      logger.debug('authenticate -> ' + alias + ' being added to the database')
      await newUser.save()
      return { authId: newUser.authId, alias: newUser.alias }
    }
  } catch (err) {
    logger.error('authenticate -> err.message = ' + err.message)
    throw err
  }
}

const Schema  = new GraphQLSchema({
  query: RootQuery,
  mutation: Mutation
})

export default Schema;
