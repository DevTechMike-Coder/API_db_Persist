const buildPaginationEnvelope = ({ total, page, limit, count }) => {
  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

  return {
    total_records: total,
    current_page: page,
    limit,
    total_pages: totalPages,
    total,
    page,
    pages: totalPages,
    pagination: {
      total_records: total,
      total,
      count,
      current_page: page,
      page,
      limit,
      per_page: limit,
      total_pages: totalPages,
      pages: totalPages,
      has_previous_page: page > 1,
      has_next_page: page < totalPages,
      previous_page: page > 1 ? page - 1 : null,
      next_page: page < totalPages ? page + 1 : null,
    },
  };
};

export const sendPaginatedSuccess = (res, { data, total, page, limit }) => {
  return res.status(200).json({
    status: "success",
    ...buildPaginationEnvelope({
      total,
      page,
      limit,
      count: data.length,
    }),
    data,
  });
};

export const sendError = (
  res,
  statusCode,
  {
    message,
    error = "Request failed",
    code,
    details,
  },
) => {
  const payload = {
    status: "error",
    message,
    error,
  };

  if (code) {
    payload.code = code;
  }

  if (details?.length) {
    payload.details = details;
  }

  return res.status(statusCode).json(payload);
};

export const sendValidationError = (res, message, details) => {
  return sendError(res, 400, {
    message,
    error: "Invalid query parameters",
    code: "INVALID_QUERY_PARAMETERS",
    details,
  });
};
