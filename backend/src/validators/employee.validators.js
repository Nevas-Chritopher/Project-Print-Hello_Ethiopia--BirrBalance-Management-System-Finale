import { AppError } from "../utils/AppError.js";
import { requireString, toPositiveInt } from "./common.validators.js";

export const validateFeedbackCreate = (body) => {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError("rating must be an integer between 1 and 5", 400);
  }

  return {
    comment: requireString(body.comment, "comment", 1000),
    rating,
    cafe_id: body.cafe_id === undefined || body.cafe_id === null || body.cafe_id === ""
      ? null
      : toPositiveInt(body.cafe_id, "cafe_id"),
  };
};
