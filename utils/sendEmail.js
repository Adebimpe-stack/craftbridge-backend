const nodemailer =
  require("nodemailer");

const sendEmail =
  async ({
    to,
    subject,
    html,
  }) => {

    try {
      const transporter = nodemailer.createTransport({

          host:
            process.env.SMTP_HOST,

          port:
            process.env.SMTP_PORT,

          secure: true,

          auth: {

            user:
              process.env.SMTP_USER,

            pass:
              process.env.SMTP_PASS,

          },

          tls: {
            rejectUnauthorized:
              false,
          },

        });

      const info =
        await transporter.sendMail({

          from:
            `"CraftBridge Jobs" <${process.env.EMAIL_FROM}>`,

          to,

          subject,

          html,

        });

      return info;
    } catch (error) {
      console.error("EMAIL ERROR:", error);
      return null;
    }

  };

module.exports =
  sendEmail;
