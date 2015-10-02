import _ from 'lodash';
import dedent from 'dedent';
import { Observable } from 'rx';
import debugFactory from 'debug';

import {
  ifNoUser401,
  ifNoUserSend
} from '../utils/middleware';

import {
  saveUser,
  observeQuery
} from '../utils/rx';

const frontEndChallangeId = '561add10cb82ac38a17513be';
const debug = debugFactory('freecc:certification');
const sendMessageToNonUser = ifNoUserSend(
  'must be logged in to complete.'
);

function isCertified(frontEndIds, { completedChallenges, isFrontEndCert }) {
  if (isFrontEndCert) {
    return true;
  }
  return _.every(frontEndIds, ({ id }) => _.some(completedChallenges, { id }));
}

export default function certificate(app) {
  const router = app.loopback.Router();
  const { Challenge } = app.models;

  const ids$ = observeQuery(
    Challenge,
    'findById',
    frontEndChallangeId,
    {
      tests: true
    }
  )
    .map(({ tests = [] }) => tests)
    .doOnNext((tests) => debug('tests', tests))
    .shareReplay();

  router.post(
    '/certificate/verify',
    ifNoUser401,
    verifyCert
  );

  router.post(
    '/certificate/honest',
    sendMessageToNonUser,
    postHonest
  );

  app.use(router);

  function verifyCert(req, res, next) {
    ids$
      .flatMap((tests) => {
        const { user } = req;
        if (!user.isFrontEndCert && isCertified(tests, user)) {
          debug('certified');
          user.isFrontEndCert = true;
          return saveUser(user);
        }
        return Observable.just(user);
      })
      .subscribe(
        user => {
          if (user.isFrontEndCert) {
            return res.status(200).send(true);
          }
          return res.status(200).send(
            dedent`
              Looks like you have not completed the neccessary steps,
              Please return the map
            `
          );
        },
        next
      );
  }

  function postHonest(req, res, next) {
    const { user } = req;
    user.isHonest = true;
    saveUser(user)
      .subscribe(
        (user) => {
          res.status(200).send(!!user.isHonest);
        },
        next
      );
  }
}
