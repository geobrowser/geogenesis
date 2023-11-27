import { DESCRIPTION, NAME, TYPES } from "../constants/systemIds.js";
import { ZodAction, type Action } from "../zod.js";
import { ipfsFetch } from "./ipfs.js";

export async function actionsFromURI(uri: string) {
  if (uri.startsWith("data:application/json;base64,")) {
    const base64 = uri.split(",")[1];
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    return decoded;
  } else if (uri.startsWith("ipfs://")) {
    const fetched = await ipfsFetch(uri);
    return fetched;
  }
}

export function isValidAction(action: any): action is Action {
  const parsedAction = ZodAction.safeParse(action);
  if (parsedAction.success) {
    return true;
  } else {
    return false;
  }
}

export const actionTypeCheck = (action: Action) => {
  const isCreateTriple = action.type === "createTriple";
  const isDeleteTriple = action.type === "deleteTriple";
  const isNameAttribute = action.attributeId === NAME;
  const isDescriptionAttribute = action.attributeId === DESCRIPTION;
  const isStringValueType = action.value.type === "string";
  const isTypeTriple =
    action.attributeId === TYPES && action.value.type === "entity";

  return {
    isNameCreateAction: isCreateTriple && isNameAttribute && isStringValueType,
    isNameDeleteAction: isDeleteTriple && isNameAttribute && isStringValueType,
    isDescriptionCreateAction:
      isCreateTriple && isDescriptionAttribute && isStringValueType,
    isDescriptionDeleteAction:
      isDeleteTriple && isDescriptionAttribute && isStringValueType,
    isTypeTriple,
  };
};
