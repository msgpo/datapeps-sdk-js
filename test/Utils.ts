import { expect } from "chai";
import * as mocha from "mocha";

import * as DataPeps from "../src/DataPeps";
import { ResourceAPI } from "../src/DataPeps";
import { Uint8Tool } from "../src/Tools";
import { kindName } from "../src/Error";

export interface itErrorsParam<Arg, Payload = null> {
  arg: Arg;
  payload?: { value?: Payload } | { func?: (actual: Payload) => void };
}

export function itErrors<Arg, Payload = null>(
  description: string,
  params: () => itErrorsParam<Arg, Payload>[],
  action: (arg: Arg) => Promise<any>,
  kind: DataPeps.ErrorKind
): mocha.ITest {
  return it(`${description} expect error(${kindName(kind)})`, async () => {
    await Promise.all(
      params().map(async p => {
        await expectErrorWithPayloadFn<Arg, Payload>(action, p, kind);
      })
    );
  });
}

export function itError(
  description: string,
  action: () => Promise<any>,
  kind: DataPeps.ErrorKind,
  payload?: () => any
): mocha.ITest {
  return it(`${description} expect error(${kindName(kind)})`, async () =>
    await expectError(action(), kind, payload != null ? payload() : null));
}

export async function expectError(
  action: Promise<any>,
  kind: DataPeps.ErrorKind,
  payload?: any
): Promise<any> {
  try {
    await action;
  } catch (e) {
    expect(e).to.not.be.null;
    expect(e).instanceof(DataPeps.Error);
    expect(
      e.kind,
      `expected ${kindName(e.kind)} to equal ${kindName(kind)}`
    ).equal(kind);
    if (payload != null) {
      expect({ ...e.payload }).to.deep.equals(payload);
    }
    return;
  }
  throw new Error(`action should throw a DataPepsError(${kindName(kind)})`);
}

export async function expectErrorWithPayloadFn<Arg, Payload>(
  action: (arg: Arg) => Promise<any>,
  param: itErrorsParam<Arg, Payload>,
  kind: DataPeps.ErrorKind
): Promise<void> {
  try {
    await action(param.arg);
  } catch (e) {
    expect(e, "caught error is null").to.not.be.null;
    expect(e, `caught error "${e}" is not a DataPeps error`).instanceOf(
      DataPeps.Error
    );
    let eErr = e as DataPeps.Error;
    expect(
      eErr.kind,
      `expected ${kindName(e.kind)} to equal ${kindName(kind)}`
    ).equal(kind);
    if (param.payload == null) {
      return;
    }
    const payload = param.payload as any;
    if (payload.func !== undefined) {
      payload.func(eErr.payload);
    } else if (payload.value != null) {
      expect(
        payload.value,
        `expected deep equality of the expected payload ${
          payload.value
        } and the actual payload ${eErr.payload}`
      ).to.deep.equals({ ...eErr.payload });
      return;
    }
    return;
  }
  throw new Error(`action should throw a DataPepsError(${kindName(kind)})`);
}

// CLASSES

export type TestResource = DataPeps.Resource<{ description: string }>;
export class ResourceContent {
  plain: Uint8Array;
  encrypted: Uint8Array;

  constructor(resource: DataPeps.Resource<{}>, content: string) {
    this.plain = Uint8Tool.encode(content);
    this.encrypted = resource.encrypt(this.plain);
  }
}

export class Resource {
  resource: DataPeps.Resource<{}>;
  content: ResourceContent;

  constructor(resource: DataPeps.Resource<{}>, content: string) {
    this.resource = resource;
    this.content = new ResourceContent(resource, content);
  }
}

// FUNCTIONS

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}

export async function wait(
  ms: number,
  predicate: () => boolean
): Promise<boolean> {
  while (ms > 0 && !predicate()) {
    ms -= 10;
    await sleep(10);
  }
  return ms > 0;
}

// CHECKING FUNCTIONS

export function checkFetchedResource(
  resourceFetched: DataPeps.Resource<{}>,
  resourceExpected: Resource
) {
  expect(resourceFetched).to.not.be.null;
  expect(resourceFetched.id).to.be.deep.equals(resourceExpected.resource.id);
  expect(resourceFetched.payload).to.be.deep.equals(
    resourceExpected.resource.payload
  );
  let decryptedContent = resourceFetched.decrypt(
    resourceExpected.content.encrypted
  );
  expect(decryptedContent).to.not.be.null;
  expect(decryptedContent).to.be.deep.equals(resourceExpected.content.plain);
}

// deprecated
function checkError(
  err,
  errorOccurred: { isTrue: boolean },
  internalCheck: () => void
) {
  expect(err).to.not.be.null;
  expect(err).instanceof(DataPeps.Error);
  internalCheck();
  errorOccurred.isTrue = true;
}

// deprecated
export function checkResourceNotFoundError(
  err,
  resourceId: DataPeps.ID,
  errorOccurred: { isTrue: boolean }
) {
  checkError(err, errorOccurred, () => {
    expect(err.kind).equal(DataPeps.ServerError.ResourceNotFound);
    expect(err.payload.id).to.be.deep.equals(resourceId);
  });
}

// deprec
export function checkIdentityNotFoundError(
  err,
  errorOccurred: { isTrue: boolean }
) {
  checkError(err, errorOccurred, () => {
    expect(err.kind).equal(DataPeps.ServerError.IdentityNotFound);
  });
}

export function checkPayloadApplicationInvalidTokenError(
  err,
  errorOccurred: { isTrue: boolean }
) {
  checkError(err, errorOccurred, () => {
    expect(err.kind).equal(DataPeps.ServerError.ApplicationInvalidToken);
  });
}

// FETCHING FUNCTIONS

export async function fetchAndCheckResource(
  session: DataPeps.Session,
  resource: Resource
): Promise<DataPeps.Resource<{}>> {
  let resourceFecthed = await new ResourceAPI(session).get(
    resource.resource.id
  );
  checkFetchedResource(resourceFecthed, resource);
  return Promise.resolve(resourceFecthed);
}
