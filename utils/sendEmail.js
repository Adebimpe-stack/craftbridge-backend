const nodemailer =
  require("nodemailer");

const sendEmail =
  async ({
    to,
    subject,
    html,
  }) => {

    try {

      console.log(
        "SMTP USER:",
        process.env.SMTP_USER
      );

      const transporter =
        nodemailer.createTransport({

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

      console.log(
        "EMAIL SENT:",
        info.response
      );

    } catch (error) {

      console.log(
        "EMAIL ERROR:",
        error
      );

    }

  };

module.exports =
  sendEmail;
