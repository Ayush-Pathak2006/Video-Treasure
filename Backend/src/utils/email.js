import Brevo from "@getbrevo/brevo";

const apiInstance = new Brevo.TransactionalEmailsApi(); //This line is used to create an instance of the Brevo API client, which will be used to send transactional emails.

apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey, //This line is used to set the API key for authentication with the Brevo service.
  process.env.BREVO_API_KEY //Setting up api key here.
);

const sendEmail = async ({ to, subject, html }) => { //The whole function for sending email.
  try {
    const response = await apiInstance.sendTransacEmail({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME
      },
      to: [{ email: to }],
      subject,
      htmlContent: html
    });

    return response;
  } catch (error) {
    console.error("Brevo email error:", error);
    throw error;
  }
};

export { sendEmail };
